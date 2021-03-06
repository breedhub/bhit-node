/**
 * ConnectionRepository.findByPathRecursive()
 */
'use strict';

const NError = require('nerror');

/**
 * Find connections by path recursively
 * @method findByPathRecursive
 * @memberOf module:repositories/connection~ConnectionRepository
 * @param {PathModel|number} path           Path to search by
 * @param {PostgresClient|string} [pg]      Will reuse the Postgres client provided, or if it is a string then will
 *                                          connect to this instance of Postgres.
 * @return {Promise}                        Resolves to array of models
 */
module.exports = async function (path, pg) {
    let client;

    try {
        client = typeof pg === 'object' ? pg : await this._postgres.connect(pg || this.constructor.instance);
        let pathRepo = this.getRepository('path');

        let load = async path => {
            let found = [];

            let result = await client.query(
                `SELECT * 
                   FROM connections 
                  WHERE path_id = $1`,
                [ typeof path === 'object' ? path.id : path ]
            );
            if (result.rowCount)
                found = found.concat(result.rows);

            let paths = await pathRepo.findByParent(path, client);
            let promises = [];
            for (let path of paths)
                promises.push(load(path));

            let results = promises.length ? await Promise.all(promises) : [];
            for (let result of results)
                found = found.concat(result);

            return found;
        };

        let rows = await client.transaction({ name: 'connection_find_by_path_recursive' }, async rollback => {
            return load(path);
        });

        if (typeof pg !== 'object')
            client.done();

        return this.getModel(rows);
    } catch (error) {
        if (client && typeof pg !== 'object')
            client.done();

        throw new NError(error, { path }, 'ConnectionRepository.findByPathRecursive()');
    }
};
