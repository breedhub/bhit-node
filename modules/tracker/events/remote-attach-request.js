/**
 * Remote Attach Request event
 * @module tracker/events/remote-attach-request
 */
const moment = require('moment-timezone');
const NError = require('nerror');

/**
 * Remote Attach Request event class
 */
class RemoteAttachRequest {
    /**
     * Create service
     * @param {App} app                                         The application
     * @param {object} config                                   Configuration
     * @param {Logger} logger                                   Logger service
     * @param {Registry} registry                               Registry service
     * @param {RegisterDaemonRequest} registerDaemonRequest     RegisterDaemonRequest event
     * @param {AttachRequest} attachRequest                     AttachRequest event
     * @param {DetachRequest} detachRequest                     DetachRequest event
     * @param {UserRepository} userRepo                         User repository
     * @param {DaemonRepository} daemonRepo                     Daemon repository
     * @param {PathRepository} pathRepo                         Path repository
     * @param {ConnectionRepository} connectionRepo             Connection repository
     */
    constructor(app, config, logger, registry, registerDaemonRequest, attachRequest, detachRequest, userRepo, daemonRepo, pathRepo, connectionRepo) {
        this._app = app;
        this._config = config;
        this._logger = logger;
        this._registry = registry;
        this._registerDaemonRequest = registerDaemonRequest;
        this._attachRequest = attachRequest;
        this._detachRequest = detachRequest;
        this._userRepo = userRepo;
        this._daemonRepo = daemonRepo;
        this._pathRepo = pathRepo;
        this._connectionRepo = connectionRepo;
    }

    /**
     * Service name is 'modules.tracker.events.remoteAttachRequest'
     * @type {string}
     */
    static get provides() {
        return 'modules.tracker.events.remoteAttachRequest';
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
            'modules.tracker.events.registerDaemonRequest',
            'modules.tracker.events.attachRequest',
            'modules.tracker.events.detachRequest',
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

        if (message.remoteAttachRequest.addressOverride === '*')
            message.remoteAttachRequest.addressOverride = '';
        if (message.remoteAttachRequest.portOverride === '*')
            message.remoteAttachRequest.portOverride = '';

        this._logger.debug('remote-attach-request', `Got REMOTE ATTACH REQUEST from ${id}`);
        let target = this._registry.validatePath(message.remoteAttachRequest.path);
        if (!target) {
            let response = this.tracker.RemoteAttachResponse.create({
                response: this.tracker.RemoteAttachResponse.Result.INVALID_PATH,
            });
            let reply = this.tracker.ServerMessage.create({
                type: this.tracker.ServerMessage.Type.REMOTE_ATTACH_RESPONSE,
                messageId: message.messageId,
                remoteAttachResponse: response,
            });
            let data = this.tracker.ServerMessage.encode(reply).finish();
            this._logger.debug('remote-attach-request', `Sending INVALID_PATH REMOTE ATTACH RESPONSE to ${id}`);
            return this.tracker.send(id, data);
        }

        let { email: userEmail, path: userPath } = target;

        this._userRepo.findByToken(message.remoteAttachRequest.token)
            .then(users => {
                let user = users.length && users[0];
                if (!user || (userEmail && userEmail !== user.email)) {
                    let response = this.tracker.RemoteAttachResponse.create({
                        response: this.tracker.RemoteAttachResponse.Result.REJECTED,
                    });
                    let reply = this.tracker.ServerMessage.create({
                        type: this.tracker.ServerMessage.Type.REMOTE_ATTACH_RESPONSE,
                        messageId: message.messageId,
                        remoteAttachResponse: response,
                    });
                    let data = this.tracker.ServerMessage.encode(reply).finish();
                    this._logger.debug('remote-attach-request', `Sending REJECTED REMOTE ATTACH RESPONSE to ${id}`);
                    return this.tracker.send(id, data);
                }
                userEmail = user.email;

                return this._daemonRepo.findByUserAndName(user, message.remoteAttachRequest.daemonName)
                    .then(daemons => {
                        let daemon = daemons.length && daemons[0];
                        if (!daemon) {
                            let response = this.tracker.RemoteAttachResponse.create({
                                response: this.tracker.RemoteAttachResponse.Result.DAEMON_NOT_FOUND,
                            });
                            let reply = this.tracker.ServerMessage.create({
                                type: this.tracker.ServerMessage.Type.REMOTE_ATTACH_RESPONSE,
                                messageId: message.messageId,
                                remoteAttachResponse: response,
                            });
                            let data = this.tracker.ServerMessage.encode(reply).finish();
                            this._logger.debug('remote-attach-request', `Sending DAEMON_NOT_FOUND REMOTE ATTACH RESPONSE to ${id}`);
                            return this.tracker.send(id, data);
                        }

                        return this._pathRepo.findByUserAndPath(user, userPath)
                            .then(paths => {
                                let path = paths.length && paths[0];
                                if (!path) {
                                    let response = this.tracker.RemoteAttachResponse.create({
                                        response: this.tracker.RemoteAttachResponse.Result.PATH_NOT_FOUND,
                                    });
                                    let reply = this.tracker.ServerMessage.create({
                                        type: this.tracker.ServerMessage.Type.REMOTE_ATTACH_RESPONSE,
                                        messageId: message.messageId,
                                        remoteAttachResponse: response,
                                    });
                                    let data = this.tracker.ServerMessage.encode(reply).finish();
                                    this._logger.debug('remote-attach-request', `Sending PATH_NOT_FOUND REMOTE ATTACH RESPONSE to ${id}`);
                                    return this.tracker.send(id, data);
                                }

                                return this._connectionRepo.findByPath(path)
                                    .then(() => {
                                        let connection = connections.length && connections[0];
                                        if (!connection) {
                                            let response = this.tracker.RemoteAttachResponse.create({
                                                response: this.tracker.RemoteAttachResponse.Result.PATH_NOT_FOUND,
                                            });
                                            let reply = this.tracker.ServerMessage.create({
                                                type: this.tracker.ServerMessage.Type.REMOTE_ATTACH_RESPONSE,
                                                messageId: message.messageId,
                                                remoteAttachResponse: response,
                                            });
                                            let data = this.tracker.ServerMessage.encode(reply).finish();
                                            this._logger.debug('remote-attach-request', `Sending PATH_NOT_FOUND REMOTE ATTACH RESPONSE to ${id}`);
                                            return this.tracker.send(id, data);
                                        }

                                        let actingAs = message.remoteAttachRequest.server ? 'server' : 'client';
                                        if (message.remoteAttachRequest.portOverride && message.remoteAttachRequest.portOverride[0] === '/' && message.remoteAttachRequest.addressOverride ||
                                            (actingAs === 'server' && (message.remoteAttachRequest.portOverride === '*' || message.remoteAttachRequest.addressOverride === '*'))) {
                                            let response = this.tracker.RemoteAttachResponse.create({
                                                response: this.tracker.RemoteAttachResponse.Result.INVALID_ADDRESS,
                                            });
                                            let reply = this.tracker.ServerMessage.create({
                                                type: this.tracker.ServerMessage.Type.REMOTE_ATTACH_RESPONSE,
                                                messageId: message.messageId,
                                                remoteAttachResponse: response,
                                            });
                                            let data = this.tracker.ServerMessage.encode(reply).finish();
                                            this._logger.debug('remote-attach-request', `Sending INVALID_ADDRESS REMOTE ATTACH RESPONSE to ${id}`);
                                            return this.tracker.send(id, data);
                                        }

                                        return this._detachRequest.disconnect(daemon, connection)
                                            .then(count => {
                                                if (!count)
                                                    return;

                                                let info = this._registry.daemons.get(daemon.id);
                                                if (info) {
                                                    let promises = [];
                                                    for (let notifyId of info.clients)
                                                        promises.push(this._registerDaemonRequest.sendConnectionsList(notifyId));

                                                    if (promises.length)
                                                        return Promise.all(promises);
                                                }
                                            })
                                            .then(() => {
                                                if (actingAs !== 'server')
                                                    return;

                                                return this._daemonRepo.findServerByConnection(connection)
                                                    .then(oldDaemons => {
                                                        let oldDaemon = oldDaemons.length && oldDaemons[0];
                                                        if (!oldDaemon)
                                                            return;

                                                        return this._detachRequest.disconnect(oldDaemon, connection)
                                                            .then(count => {
                                                                if (!count)
                                                                    return;

                                                                let info = this._registry.daemons.get(oldDaemon.id);
                                                                if (info) {
                                                                    let promises = [];
                                                                    for (let notifyId of info.clients)
                                                                        promises.push(this._registerDaemonRequest.sendConnectionsList(notifyId));

                                                                    if (promises.length)
                                                                        return Promise.all(promises);
                                                                }
                                                            });
                                                    });
                                            })
                                            .then(() => {
                                                return this._attachRequest.connect(
                                                    daemon,
                                                    connection,
                                                    actingAs,
                                                    message.remoteAttachRequest.addressOverride,
                                                    message.remoteAttachRequest.portOverride
                                                );
                                            })
                                            .then(count => {
                                                return Promise.resolve()
                                                    .then(() => {
                                                        let info = this._registry.daemons.get(daemon.id);
                                                        if (info) {
                                                            let promises = [];
                                                            for (let notifyId of info.clients)
                                                                promises.push(this._registerDaemonRequest.sendConnectionsList(notifyId));

                                                            if (promises.length)
                                                                return Promise.all(promises);
                                                        }
                                                    })
                                                    .then(() => {
                                                        let response = this.tracker.RemoteAttachResponse.create({
                                                            response: (count > 0 ?
                                                                this.tracker.RemoteAttachResponse.Result.ACCEPTED :
                                                                this.tracker.RemoteAttachResponse.Result.ALREADY_ATTACHED),
                                                        });
                                                        let reply = this.tracker.ServerMessage.create({
                                                            type: this.tracker.ServerMessage.Type.REMOTE_ATTACH_RESPONSE,
                                                            messageId: message.messageId,
                                                            remoteAttachResponse: response,
                                                        });
                                                        let data = this.tracker.ServerMessage.encode(reply).finish();
                                                        this._logger.debug('remote-attach-request', `Sending ACCEPTED REMOTE ATTACH RESPONSE to ${id}`);
                                                        this.tracker.send(id, data);
                                                    });
                                            });
                                });
                            });
                    });
            })
            .catch(error => {
                this._logger.error(new NError(error, 'RemoteAttachRequest.handle()'));
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

module.exports = RemoteAttachRequest;