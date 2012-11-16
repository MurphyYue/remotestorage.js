define(['../util', './pending'], function(util, pendingAdapter) {

  var DB_NAME = 'remoteStorage';
  var DB_VERSION = 1;
  var OBJECT_STORE_NAME = 'nodes';

  var logger = util.getLogger('store::indexed_db');

  var adapter = function(indexedDB) {
    if(! indexedDB) {
      throw new Error("Not supported: indexedDB not found");
    }

    var DB = undefined;

    function removeDatabase() {
      return util.makePromise(function(promise) {
        if(DB) {
          try {
            DB.close();
          } catch(exc) {
            // ignored.
          };
          DB = undefined;
        }
        var request = indexedDB.deleteDatabase(DB_NAME);

        request.onsuccess = function() {
          promise.fulfill();
        };

        request.onerror = function() {
          promise.fail();
        };
      });
    }

    function openDatabase() {
      logger.info("Opening database " + DB_NAME + '@' + DB_VERSION);
      return util.makePromise(function(promise) {
        var dbRequest = indexedDB.open(DB_NAME, DB_VERSION);

        function upgrade(db) {
          db.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'key' });
        }
        
        dbRequest.onupgradeneeded = function(event) {
          console.log('creating object store (onupgradeneeded)');
          upgrade(event.target.result);
        };

        dbRequest.onsuccess = function(event) {
          var database = event.target.result;
          if(typeof(database.setVersion) === 'function') {
            var versionRequest = database.setVersion(DB_VERSION);
            versionRequest.onsuccess = function(event) {
              console.log('version request', event);
              upgrade(database);
              event.target.transaction.oncomplete = function() {
                promise.fulfill(database);
              };
            };
          } else {
            // assume onupgradeneeded is supported.
            console.log('DB VERSION', database.version);
            promise.fulfill(database);
          }
        };

        dbRequest.onerror = function(event) {
          console.error("indexedDB.open failed: ", event);
          promise.fail(new Error("Failed to open database!"));
        }; 
      });
    }

    function storeRequest(methodName) {
      var args = Array.prototype.slice.call(arguments, 1);
      return util.makePromise(function(promise) {
        var store = DB.transaction(OBJECT_STORE_NAME, 'readwrite').
          objectStore(OBJECT_STORE_NAME);
        var request = store[methodName].apply(store, args);
        request.onsuccess = function() {
          console.log('SUCCESS', methodName, args[0], request.result);
          promise.fulfill(request.result);
        };
        request.onerror = function(event) {
          console.log('FAILURE', methodName);
          promise.fail(event.error);
        };
      });
    }

    var indexedDbStore = {
      on: function(eventName, handler) {
        logger.info("WARNING: indexedDB event handling not implemented");
      },
      get: function(key) {
        logger.info("GET " + key);
        return storeRequest('get', key);
      },
      set: function(key, value) {
        logger.info("SET " + key);
        var node = value;
        node.key = key;
        return storeRequest('put', node);
      },
      remove: function(key) {
        logger.info("REMOVE " + key);
        return storeRequest('delete', key);
      },
      forgetAll: function() {
        logger.info("FORGET ALL");
        return storeRequest('clear', store);
      }
    };

    var tempStore = pendingAdapter();

    function replaceAdapter() {
      tempStore.flush(indexedDbStore);
      util.extend(tempStore, indexedDbStore);
    }

    removeDatabase().
      then(openDatabase).
      then(function(db) {
        DB = db;
        replaceAdapter();
      });

    return tempStore;
  };

  adapter.detect = function() {
    var indexedDB = undefined;
    if(typeof(window) !== 'undefined') {
      indexedDB = (window.indexedDB || window.webkitIndexedDB ||
                   window.mozIndexedDB || window.msIndexedDB);
    }
    return indexedDB;
  }

  return adapter;
});
