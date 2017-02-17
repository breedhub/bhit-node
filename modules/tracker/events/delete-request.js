/**
 * Delete Request event
 * @module tracker/events/delete-request
 */
const debug = require('debug')('bhit:tracker');
const moment = require('moment-timezone');
const WError = require('verror').WError;

/**
 * Delete Request event class
 */
class DeleteRequest {
    /**
     * Create service
     * @param {App} app                                 The application
     * @param {object} config                           Configuration
     * @param {Logger} logger                           Logger service
     * @param {UserRepository} userRepo                 User repository
     * @param {DaemonRepository} daemonRepo             Daemon repository
     * @param {PathRepository} pathRepo                 Path repository
     */
    constructor(app, config, logger, userRepo, daemonRepo, pathRepo) {
        this._app = app;
        this._config = config;
        this._logger = logger;
        this._userRepo = userRepo;
        this._daemonRepo = daemonRepo;
        this._pathRepo = pathRepo;
    }

    /**
     * Service name is 'modules.tracker.events.deleteRequest'
     * @type {string}
     */
    static get provides() {
        return 'modules.tracker.events.deleteRequest';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'logger', 'repositories.user', 'repositories.daemon', 'repositories.path' ];
    }

    /**
     * Event handler
     * @param {string} id           ID of the client
     * @param {object} message      The message
     */
    handle(id, message) {
        let client = this.tracker.clients.get(id);
        if (!client)
            return;

        debug(`Got DELETE REQUEST from ${client.socket.remoteAddress}:${client.socket.remotePort}`);
        return Promise.resolve()
            .then(() => {
                if (!client.daemonId)
                    return [];

                return this._daemonRepo.find(client.daemonId);
            })
            .then(daemons => {
                let daemon = daemons.length && daemons[0];
                if (!daemon) {
                    let response = this.tracker.DeleteResponse.create({
                        response: this.tracker.DeleteResponse.Result.REJECTED,
                    });
                    let reply = this.tracker.ServerMessage.create({
                        type: this.tracker.ServerMessage.Type.DELETE_RESPONSE,
                        messageId: message.messageId,
                        deleteResponse: response,
                    });
                    let data = this.tracker.ServerMessage.encode(reply).finish();
                    debug(`Sending DELETE RESPONSE to ${client.socket.remoteAddress}:${client.socket.remotePort}`);
                    return this.tracker.send(id, data);
                }
                if (!this.tracker.validatePath(message.deleteRequest.path)) {
                    let response = this.tracker.DeleteResponse.create({
                        response: this.tracker.DeleteResponse.Result.INVALID_PATH,
                    });
                    let reply = this.tracker.ServerMessage.create({
                        type: this.tracker.ServerMessage.Type.DELETE_RESPONSE,
                        messageId: message.messageId,
                        deleteResponse: response,
                    });
                    let data = this.tracker.ServerMessage.encode(reply).finish();
                    debug(`Sending DELETE RESPONSE to ${client.socket.remoteAddress}:${client.socket.remotePort}`);
                    return this.tracker.send(id, data);
                }

                return Promise.all([
                        this._pathRepo.findByUserAndPath(daemon.userId, message.deleteRequest.path),
                        this._userRepo.find(daemon.userId),
                    ])
                    .then(([ paths, users ]) => {
                        let path = paths.length && paths[0];
                        let user = users.length && users[0];
                        if (!path || !user) {
                            let response = this.tracker.DeleteResponse.create({
                                response: this.tracker.DeleteResponse.Result.PATH_NOT_FOUND,
                            });
                            let reply = this.tracker.ServerMessage.create({
                                type: this.tracker.ServerMessage.Type.DELETE_RESPONSE,
                                messageId: message.messageId,
                                deleteResponse: response,
                            });
                            let data = this.tracker.ServerMessage.encode(reply).finish();
                            debug(`Sending DELETE RESPONSE to ${client.socket.remoteAddress}:${client.socket.remotePort}`);
                            return this.tracker.send(id, data);
                        }

                        return this._pathRepo.findByUserAndPathRecursive(path.path)
                            .then(paths => {
                                for (let [ thisClientId, thisClient ] of this.tracker.clients) {
                                    if (thisClient.status) {
                                        for (let path of paths) {
                                            let name = user.email + path.path;
                                            thisClient.status.delete(name);
                                        }
                                    }
                                }
                                for (let path of paths) {
                                    let name = user.email + path.path;
                                    let waiting = this.tracker.waiting.get(name);
                                    if (waiting) {
                                        if (waiting.server) {
                                            let thisServer = this.tracker.clients.get(waiting.server);
                                            if (!thisServer || !thisServer.status || !thisServer.status.has(name))
                                                waiting.server = null;
                                        }
                                        for (let thisClientId of waiting.clients) {
                                            let thisClient = this.tracker.clients.get(thisClientId);
                                            if (!thisClient || !thisClient.status || !thisClient.status.has(name))
                                                waiting.clients.delete(thisClientId);
                                        }
                                    }
                                }

                                return this._pathRepo.deleteRecursive(path);
                            })
                            .then(() => {
                                let response = this.tracker.DeleteResponse.create({
                                    response: this.tracker.DeleteResponse.Result.ACCEPTED,
                                });
                                let reply = this.tracker.ServerMessage.create({
                                    type: this._tracker.ServerMessage.Type.DELETE_RESPONSE,
                                    messageId: message.messageId,
                                    deleteResponse: response,
                                });
                                let data = this.tracker.ServerMessage.encode(reply).finish();
                                debug(`Sending DELETE RESPONSE to ${client.socket.remoteAddress}:${client.socket.remotePort}`);
                                this.tracker.send(id, data);
                            });
                    });
            })
            .catch(error => {
                this._logger.error(new WError(error, 'DeleteRequest.handle()'));
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

module.exports = DeleteRequest;