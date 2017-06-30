/**
 * Status command
 * @module commands/status
 */
const path = require('path');
const argvParser = require('argv');

/**
 * Command class
 */
class Status {
    /**
     * Create the service
     * @param {App} app                 The application
     * @param {object} config           Configuration
     * @param {Start} start             Start command
     */
    constructor(app, config, start) {
        this._app = app;
        this._config = config;
        this._start = start;
    }

    /**
     * Service name is 'commands.status'
     * @type {string}
     */
    static get provides() {
        return 'commands.status';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'commands.start' ];
    }

    /**
     * Run the command
     * @param {string[]} argv           Arguments
     * @return {Promise}
     */
    run(argv) {
        let args = argvParser
            .option({
                name: 'help',
                short: 'h',
                type: 'boolean',
            })
            .run(argv);

        return this._start.exec('status', [ '/var/run/bhit/daemon.pid' ])
            .then(result => {
                process.exit(result.code);
            })
            .catch(error => {
                return this.error(error);
            });
    }

    /**
     * Log error and terminate
     * @param {...*} args
     */
    error(...args) {
        return args.reduce(
            (prev, cur) => {
                return prev.then(() => {
                    return this._app.error(cur.fullStack || cur.stack || cur.message || cur);
                });
            },
            Promise.resolve()
            )
            .then(
                () => {
                    process.exit(1);
                },
                () => {
                    process.exit(1);
                }
            );
    }
}

module.exports = Status;