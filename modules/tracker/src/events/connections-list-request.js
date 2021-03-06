/**
 * Connections List Request event
 * @module tracker/events/connections-list-request
 */
const NError = require('nerror');
const Base = require('./base');

/**
 * Connections List Request event class
 */
class ConnectionsListRequest extends Base {
    /**
     * Create service
     * @param {App} app                                 The application
     * @param {object} config                           Configuration
     * @param {Logger} logger                           Logger service
     * @param {Registry} registry                       Registry service
     * @param {DaemonRepository} daemonRepo             Daemon repository
     */
    constructor(app, config, logger, registry, daemonRepo) {
        super(app);
        this._config = config;
        this._logger = logger;
        this._registry = registry;
        this._daemonRepo = daemonRepo;
    }

    /**
     * Service name is 'tracker.events.connectionsListRequest'
     * @type {string}
     */
    static get provides() {
        return 'tracker.events.connectionsListRequest';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'logger', 'registry', 'repositories.daemon' ];
    }

    /**
     * Event name
     * @type {string}
     */
    get name() {
        return 'connections_list_request';
    }

    /**
     * Event handler
     * @param {string} id           ID of the client
     * @param {object} message      The message
     */
    async handle(id, message) {
        let client = this._registry.clients.get(id);
        if (!client)
            return;

        this._logger.debug('connections-list-request', `Got CONNECTIONS LIST REQUEST from ${id}`);
        try {
            let daemons = [];
            if (client.daemonId)
                daemons = await this._daemonRepo.find(client.daemonId);
            let daemon = daemons.length && daemons[0];
            if (!daemon) {
                let response = this.tracker.ConnectionsListResponse.create({
                    response: this.tracker.ConnectionsListResponse.Result.REJECTED,
                });
                let reply = this.tracker.ServerMessage.create({
                    type: this.tracker.ServerMessage.Type.CONNECTIONS_LIST_RESPONSE,
                    messageId: message.messageId,
                    connectionsListResponse: response,
                });
                let data = this.tracker.ServerMessage.encode(reply).finish();
                this._logger.debug('connections-list-request', `Sending REJECTED CONNECTIONS LIST RESPONSE to ${id}`);
                return this.tracker.send(id, data);
            }

            let list = await this._daemonRepo.getConnectionsList(daemon);
            if (!list) {
                let response = this.tracker.ConnectionsListResponse.create({
                    response: this.tracker.ConnectionsListResponse.Result.REJECTED,
                });
                let reply = this.tracker.ServerMessage.create({
                    type: this.tracker.ServerMessage.Type.CONNECTIONS_LIST_RESPONSE,
                    messageId: message.messageId,
                    connectionsListResponse: response,
                });
                let data = this.tracker.ServerMessage.encode(reply).finish();
                this._logger.debug('connections-list-request', `Sending REJECTED CONNECTIONS LIST RESPONSE to ${id}`);
                return this.tracker.send(id, data);
            }

            let prepared = this.tracker.ConnectionsList.create({
                serverConnections: [],
                clientConnections: [],
            });
            for (let item of list.serverConnections)
                prepared.serverConnections.push(this.tracker.ServerConnection.create(item));
            for (let item of list.clientConnections)
                prepared.clientConnections.push(this.tracker.ClientConnection.create(item));

            let response = this.tracker.ConnectionsListResponse.create({
                response: this.tracker.ConnectionsListResponse.Result.ACCEPTED,
                list: prepared,
            });
            let reply = this.tracker.ServerMessage.create({
                type: this.tracker.ServerMessage.Type.CONNECTIONS_LIST_RESPONSE,
                messageId: message.messageId,
                connectionsListResponse: response,
            });
            let data = this.tracker.ServerMessage.encode(reply).finish();
            this._logger.debug('connections-list-request', `Sending ACCEPTED CONNECTIONS LIST RESPONSE to ${id}`);
            this.tracker.send(id, data);
        } catch (error) {
            this._logger.error(new NError(error, 'ConnectionsListRequest.handle()'));
        }
    }
}

module.exports = ConnectionsListRequest;
