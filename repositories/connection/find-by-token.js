/**
 * ConnectionRepository.findByToken()
 */
'use strict';

const WError = require('verror').WError;

/**
 * Find connections by token
 * @method findByToken
 * @memberOf module:repositories/connection~ConnectionRepository
 * @param {string} token                    Token to search by
 * @param {PostgresClient|string} [pg]      Will reuse the Postgres client provided, or if string then will connect to
 *                                          this instance of Postgres.
 * @return {Promise}                        Resolves to array of models
 */
module.exports = function (token, pg) {
    return Promise.resolve()
        .then(() => {
            if (typeof pg === 'object')
                return pg;

            return this._postgres.connect(pg);
        })
        .then(client => {
            return client.query(
                    'SELECT * ' +
                    '  FROM connections ' +
                    ' WHERE token = $1 ',
                    [ token ]
                )
                .then(result => {
                    return result.rowCount ? result.rows : [];
                })
                .then(
                    value => {
                        if (typeof pg !== 'object')
                            client.done();
                        return value;
                    },
                    error => {
                        if (typeof pg !== 'object')
                            client.done();
                        throw error;
                    }
                );
        })
        .then(rows => {
            let models = [];
            for (let row of rows) {
                let model = this.create();
                this._postgres.constructor.unserializeModel(model, row);
                models.push(model);
            }

            return models;
        })
        .catch(error => {
            throw new WError(error, 'ConnectionRepository.findByToken()');
        });
};
