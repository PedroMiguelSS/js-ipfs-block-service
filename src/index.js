'use strict'

const parallelLimit = require('run-parallel-limit')
const pull = require('pull-stream')

// BlockService is a hybrid block datastore. It stores data in a local
// datastore and may retrieve data from a remote Exchange.
// It uses an internal `datastore.Datastore` instance to store values.
module.exports = class BlockService {
  constructor (ipfsRepo) {
    this._repo = ipfsRepo
    this._bitswap = null
  }

  goOnline (bitswap) {
    this._bitswap = bitswap
  }

  goOffline () {
    this._bitswap = null
  }

  isOnline () {
    return this._bitswap != null
  }

  put (block, callback) {
    callback = callback || (() => {})
    if (!block) {
      return callback(new Error('Missing block'))
    }

    pull(
      pull.values([
        block
      ]),
      this.putStream(),
      pull.onEnd(callback)
    )
  }

  putStream () {
    if (this.isOnline()) {
      return this._bitswap.putStream()
    }

    return pull(
      pull.map((block) => {
        return { data: block.data, key: block.key() }
      }),
      this._repo.blockstore.putStream()
    )
  }

  get (key, callback) {
    pull(
      this.getStream(key),
      pull.collect((err, result) => {
        if (err) {
          return callback(err)
        }
        callback(null, result[0])
      })
    )
  }

  getStream (key) {
    if (this.isOnline()) {
      return this._bitswap.getStream(key)
    }

    return this._repo.blockstore.getStream(key)
  }

  delete (keys, callback) {
    if (!Array.isArray(keys)) {
      keys = [keys]
    }

    parallelLimit(keys.map((key) => (next) => {
      this._repo.blockstore.delete(key, next)
    }), 100, callback)
  }
}
