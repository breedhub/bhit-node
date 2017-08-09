/**
 * Import Request event
 * @module tracker/events/import-request
 */
const moment = require('moment-timezone');
const NError = require('nerror');

/**
 * Import Request event class
 */
class ImportRequest {
    /**
     * Create service
     * @param {App} app                                 The application
     * @param {object} config                           Configuration
     * @param {Logger} logger                           Logger service
     * @param {Registry} registry                       Registry service
     * @param {UserRepository} userRepo                 User repository
     * @param {DaemonRepository} daemonRepo             Daemon repository
     * @param {PathRepository} pathRepo                 Path repository
     * @param {ConnectionRepository} connectionRepo     Connection repository
     */
    constructor(app, config, logger, registry, userRepo, daemonRepo, pathRepo, connectionRepo) {
        this._app = app;
        this._config = config;
        this._logger = logger;
        this._registry = registry;
        this._userRepo = userRepo;
        this._daemonRepo = daemonRepo;
        this._pathRepo = pathRepo;
        this._connectionRepo = connectionRepo;
    }

    /**
     * Service name is 'modules.tracker.events.importRequest'
     * @type {string}
     */
    static get provides() {
        return 'modules.tracker.events.importRequest';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [
            'app',
            'config',
            'logger',
            'registry',
            'repositories.user',
            'repositories.daemon',
            'repositories.path',
            'repositories.connection'
        ];
    }

    /**
     * Event handler
     * @param {string} id           ID of the client
     * @param {object} message      The message
     */
    handle(id, message) {
        let client = this._registry.clients.get(id);
        if (!client)
            return;

        this._logger.debug('import-request', `Got IMPORT REQUEST from ${id}`);
        return Promise.resolve()
            .then(() => {
                if (!client.daemonId)
                    return [];

                return this._daemonRepo.find(client.daemonId);
            })
            .then(daemons => {
                let daemon = daemons.length && daemons[0];
                if (!daemon) {
                    let response = this.tracker.ImportResponse.create({
                        response: this.tracker.ImportResponse.Result.REJECTED,
                    });
                    let reply = this.tracker.ServerMessage.create({
                        type: this.tracker.ServerMessage.Type.IMPORT_RESPONSE,
                        messageId: message.messageId,
                        importResponse: response,
                    });
                    let data = this.tracker.ServerMessage.encode(reply).finish();
                    this._logger.debug('import-request', `Sending REJECTED IMPORT RESPONSE to ${id}`);
                    return this.tracker.send(id, data);
                }

                return Promise.all([
                        this._pathRepo.findByToken(message.importRequest.token),
                        this._connectionRepo.findByToken(message.importRequest.token)
                    ])
                    .then(([ paths, connections ]) => {
                        let path = paths.length && paths[0];
                        let connection = connections.length && connections[0];
                        let userId;

                        let actingAs;
                        if (path) {
                            actingAs = 'client';
                            userId = path.userId;
                        } else if (connection) {
                            actingAs = 'server';
                            userId = connection.userId;
                        } else {
                            let response = this.tracker.ImportResponse.create({
                                response: this.tracker.ImportResponse.Result.REJECTED,
                            });
                            let reply = this.tracker.ServerMessage.create({
                                type: this.tracker.ServerMessage.Type.IMPORT_RESPONSE,
                                messageId: message.messageId,
                                importResponse: response,
                            });
                            let data = this.tracker.ServerMessage.encode(reply).finish();
                            this._logger.debug('import-request', `Sending REJECTED IMPORT RESPONSE to ${id}`);
                            return this.tracker.send(id, data);
                        }

                        let loadConnections = path => {
                            let result = [];
                            return this._connectionRepo.findByPath(path)
                                .then(connections => {
                                    let connection = connections.length && connections[0];
                                    if (connection)
                                        result.push(connection);

                                    return this._pathRepo.findByParent(path)
                                        .then(paths => {
                                            let promises = [];
                                            for (let subPath of paths)
                                                promises.push(loadConnections(subPath));

                                            return Promise.all(promises)
                                                .then(loaded => {
                                                    for (let subConnections of loaded)
                                                        result = result.concat(subConnections);

                                                    return result;
                                                });
                                        });
                                });
                        };

                        return Promise.resolve()
                            .then(() => {
                                if (actingAs === 'server')
                                    return [ connection ];

                                return loadConnections(path);
                            })
                            .then(connections => {
                                let serverConnections = [], clientConnections = [];

                                return this._userRepo.find(userId)
                                    .then(users => {
                                        let user = users.length && users[0];
                                        if (!user)
                                            return this.tracker.ImportResponse.Result.REJECTED;

                                        let promises = [];
                                        if (actingAs === 'server') {
                                            let connection = connections.length && connections[0];
                                            if (connection) {
                                                promises.push(
                                                    this._pathRepo.find(connection.pathId)
                                                        .then(paths => {
                                                            let path = paths.length && paths[0];
                                                            if (!path)
                                                                return;

                                                            return this._daemonRepo.findByConnection(connection)
                                                                .then(clientDaemons => {
                                                                    let clients = [];
                                                                    let clientPromises = [];
                                                                    for (let clientDaemon of clientDaemons) {
                                                                        if (clientDaemon.actingAs !== 'client')
                                                                            continue;

                                                                        clientPromises.push(
                                                                            this._userRepo.find(clientDaemon.userId)
                                                                                .then(clientUsers => {
                                                                                    let clientUser = clientUsers.length && clientUsers[0];
                                                                                    if (!clientUser)
                                                                                        return;

                                                                                    clients.push(clientUser.email + '?' + clientDaemon.name);
                                                                                })
                                                                        );
                                                                    }

                                                                    return Promise.all(clientPromises)
                                                                        .then(() => {
                                                                            let { address, port } = this._registry.addressOverride(
                                                                                connection.connectAddress,
                                                                                connection.connectPort,
                                                                                connection.addressOverride,
                                                                                connection.portOverride
                                                                            );

                                                                            serverConnections.push(this.tracker.ServerConnection.create({
                                                                                name: user.email + path.path,
                                                                                connectAddress: address,
                                                                                connectPort: port,
                                                                                encrypted: connection.encrypted,
                                                                                fixed: connection.fixed,
                                                                                clients: clients,
                                                                            }));
                                                                        });
                                                                });
                                                        })
                                                );
                                            }
                                        } else {
                                            for (let connection of connections) {
                                                promises.push(
                                                    this._pathRepo.find(connection.pathId)
                                                        .then(paths => {
                                                            let path = paths.length && paths[0];
                                                            if (!path)
                                                                return;

                                                            return this._daemonRepo.findServerByConnection(connection)
                                                                .then(serverDaemons => {
                                                                    let serverDaemon = serverDaemons.length && serverDaemons[0];

                                                                    return Promise.resolve()
                                                                        .then(() => {
                                                                            if (!serverDaemon)
                                                                                return [];

                                                                            return this._userRepo.find(serverDaemon.userId);
                                                                        })
                                                                        .then(serverUsers => {
                                                                            let serverUser = serverUsers.length && serverUsers[0];

                                                                            let { address, port } = this._registry.addressOverride(
                                                                                connection.listenAddress,
                                                                                connection.listenPort,
                                                                                connection.addressOverride,
                                                                                connection.portOverride
                                                                            );

                                                                            clientConnections.push(this.tracker.ClientConnection.create({
                                                                                name: user.email + path.path,
                                                                                listenAddress: address,
                                                                                listenPort: port,
                                                                                encrypted: connection.encrypted,
                                                                                fixed: connection.fixed,
                                                                                server: (serverDaemon && serverUser) ? serverUser.email + '?' + serverDaemon.name : '',
                                                                            }));
                                                                        });
                                                                });
                                                        })
                                                );
                                            }
                                        }

                                        return Promise.all(promises)
                                            .then(() => {
                                                return this.tracker.ImportResponse.Result.ACCEPTED;
                                            });
                                    })
                                    .then(value => {
                                        let list = this.tracker.ConnectionsList.create({
                                            serverConnections: serverConnections,
                                            clientConnections: clientConnections,
                                        });
                                        let response = this.tracker.ImportResponse.create({
                                            response: value,
                                            updates: list,
                                        });
                                        let reply = this.tracker.ServerMessage.create({
                                            type: this.tracker.ServerMessage.Type.IMPORT_RESPONSE,
                                            messageId: message.messageId,
                                            importResponse: response,
                                        });
                                        let data = this.tracker.ServerMessage.encode(reply).finish();
                                        this._logger.debug('import-request', `Sending RESULTING IMPORT RESPONSE to ${id}`);
                                        this.tracker.send(id, data);
                                    });
                            });
                    });
            })
            .catch(error => {
                this._logger.error(new NError(error, 'ImportRequest.handle()'));
            });
    }

    /**
     * Retrieve server
     * @return {Tracker}
     */
    get tracker() {
        if (this._tracker)
            return this._tracker;
        this._tracker = this._app.get('servers').get('tracker');
        return this._tracker;
    }
}

module.exports = ImportRequest;