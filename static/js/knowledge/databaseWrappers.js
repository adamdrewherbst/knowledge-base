/*
    databaseWrappers.js - Adam Herbst 4/23/19

    This file's main purpose is to specify the wrapper classes for the database tables.  These tables are
    specified in /models/db.py.  When we load a database entry from the server, the 'storeEntries' function in this
    file is called.  That function creates an object in memory to hold the entry so we don't have to load it every time
    we need to reference it.  The prototype of the created object corresponds to the table it is from.  For example,
    when we load a concept, a Concept object (defined below) is created.  All fields from the database are stored in the
    object, and its prototype has functions allowing it to perform actions specific to that table.  For example, the
    Concept prototype has an 'instanceOf' function to check whether that concept is an instance of another specified concept.

    The short Misc library is also defined here since it is used several times by the wrapper classes.  It simplifies common operations on JavaScript objects like adding a
    key whose parent keys may or may not have been added already.
*/

        var Misc = {};

        Misc.toArray = function(obj) {
            arr = [];
            for(let key in obj) {
                arr.push(obj[key]);
            }
            return arr;
        };

        /*
            get the value at an index of a JS object.  For example, Misc.getIndex(obj, 'a', 'b', 'c') will check if
            obj['a']['b']['c'] exists, and if so return its value.  Without this helper function we'd have to first check if
            obj['a'] exists, then obj['a']['b'], then obj['a']['b']['c'] to avoid runtime index errors.
        */
        Misc.getIndex = function() {
            let args = Misc.cleanArguments(arguments), n = args.length, ref = args[0];
            for(let i = 1; i < n; i++) {
                let index = args[i];
                if(index === undefined) continue;
                if(typeof ref !== 'object'
                    || !ref.hasOwnProperty(index)) return undefined;
                ref = ref[index];
            }
            return ref;
        };

        /*
            like getIndex, but creates the index with the specified value if it doesn't exist yet.  For example,
            Misc.getOrCreateIndex(obj, 'a', 'b', 5) will return obj['a']['b'] if it already exists, otherwise set it to 5.
        */
        Misc.getOrCreateIndex = function() {
            let args = Misc.cleanArguments(arguments), n = args.length, ref = args[0];
            for(let i = 1; i < n; i++) {
                let index = args[i];
                if(index === undefined) continue;
                if(!ref[index]) ref[index] = {};
                ref = ref[index];
            }
            return ref;
        };

        /*
            set an index of an object.  Same syntax as above, but in this case the index will be overwritten if it exists.
        */
        Misc.setIndex = function(obj) {
            let args = Misc.cleanArguments(arguments), n = args.length, ref = args[0];
            for(let i = 1; i < n-2; i++) {
                let index = args[i];
                if(index === undefined) continue;
                if(!ref[index]) ref[index] = {};
                ref = ref[index];
            }
            ref[args[n-2]] = args[n-1];
        };

        /*
            Delete the specified index of the given object.
        */
        Misc.deleteIndex = function(obj) {
            let args = Misc.cleanArguments(arguments), n = args.length, ref = args[0], i = 1, refs = [];
            for(; i < n-1; i++) {
                let index = args[i];
                if(index === undefined) continue;
                if(!ref[index]) return;
                refs.push(ref);
                ref = ref[index];
            }
            while(ref && Object.keys(ref).length > 0) {
                delete ref[args[i--]];
                ref = refs.pop();
            }
        };

        /*
            loop through each sub-key of the given key of the given object, calling the callback function
            on the value of the subkey.  If the callback returns true the loop halts.  If the key is omitted,
            all keys of the object will be looped through.
        */
        Misc.each = function(obj, callback, key) {
            if(!obj || typeof obj !== 'object') return;
            let stop = callback.call(obj, obj, key);
            if(stop === true) return;
            for(let k in obj) {
                if(stop && typeof stop === 'object' && stop[k]) continue;
                if(obj[k] && typeof obj[k] === 'object')
                    Misc.each(obj[k], callback, k);
            }
        };

        /*
            apply a callback function to a sub-object of an object, treating the sub-object
            as an array according to its keys
        */
        Misc.eachChild = function() {

            let n = arguments.length;
            if(n < 2) return;
            let callback = arguments[n-1];
            if(typeof callback !== 'function') return;
            delete arguments[n-1];

            //get the requested sub-object
            let args = [];
            for(let i = 1; i < n-1; i++) args.push(arguments[i]);
            let sub = Misc.getIndex(arguments[0], args);
            if(sub === undefined) return;

            //if this key has keys 0,1,2... then it is an array
            //and we must perform the callback on each element
            Misc.asArray(sub).forEach(function(subsub) {
                callback.call(this, subsub);
            });
        };

        /*
            used by the above functions - given an argument list,
            converts undefined values to empty strings, and unpacks arrays,
            so that we have a single list of strings, representing a chain of indices in a JS object
        */
        Misc.cleanArguments = function(args, clean) {
            if(!clean) clean = [];
            for(let i = 0; i < args.length; i++) {
                if(args[i] === undefined) clean.push('');
                else if(Array.isArray(args[i])) {
                    Misc.cleanArguments(args[i], clean);
                } else clean.push(args[i]);
            }
            return clean;
        };

        /*
            Convert an object to an array.  If the object has only numeric keys starting from 0,
            the values of these keys are the elements of the array.  Otherwise, the array's only element is
            the object itself.  If the object has 0-indexed numeric keys but also other keys, the
            whole object is appended as a final array element.  Used here and in nodeData.js
        */
        Misc.asArray = function(obj) {
            if(typeof obj !== 'object') return [obj];
            let arr = [], i = 0;
            for(; obj.hasOwnProperty(i); i++) {
                arr.push(obj[i]);
            }
            let keys = Object.keys(obj);
            // if there were no indexed keys or if the object has other subkeys, add the whole object to the array
            if(arr.length == 0 || keys.length > i) {
                // ... unless the only other key is an empty '_value' key
                if(!(i > 0 && keys.length == i+1 && keys[i] == '_value' && !obj._value))
                    arr.push(obj);
            }
            return arr;
        };

        Misc.booleanValues = function(obj) {
            if(typeof obj !== 'object') return {};
            let ret = obj;
            for(let k in ret) ret[k] = true;
            return ret;
        };



        Page.load = function(callback) {
            $.ajax({
                url: Page.loadURL,
                type: 'post',
                dataType: 'json',
                data: JSON.stringify({}),
                success: function(data) {
                    Page.store(data);
                    if(typeof callback === 'function') callback.call(Page, data);
                }
            });
        };

        Page.save = function() {
            let records = {};
            Page.eachTable(function(table, name) {
                table.eachRecord(function(record, id) {
                    if(record.deleted) {
                        if(id > 0) records[table][id] = { id: id, deleted: true };
                    } else {
                        if(record instanceof Concept) {
                            records.concept[id] = {
                                name: record.name,
                                description: record.description,
                            };
                        } else if(record instanceof Part) {
                            records.part[id] = {
                                concept: record.getConcept()
                            };
                            if(part instanceof Link) {
                                records.part[id].start = record.getStart().getId();
                                records.part[id].end = record.getEnd().getId();
                            }
                        }
                        if(id > 0) records[name][id].id = id;
                    }
                });
            });
            $.ajax({
                url: Page.saveURL,
                type: 'post',
                dataType: 'json',
                data: JSON.stringify({records: records}),
                success: function(data) {
                    Page.store(data);
                }
            });
        };

        Page.eachTable = function(callback) {
            for(let name in Page.tables) {
                let table = Page.tables[name];
                if(callback.call(table, table, name) === false) return false;
            }
            return true;
        };

        Page.store = function(data) {
            Page.eachTable(function(table, name) {
                if(!data[name]) return;
                for(let id in data[name]) {
                    table.store(data[name][id], id);
                }
            });
        };


        function Table(type) {
            this.type = type;
            this.records = {};
            this.nextId = -1;
        }

        Table.prototype.get = function(data) {
            let record = null;
            if(data instanceof this.type) {
                record = data;
            } else if(data instanceof go.GraphObject) {
                let part = data.part ? data.part : data;
                if(part instanceof go.Node) {
                    let id = part.data ? part.data.id : null;
                    if(id) record = this.records[id] || null;
                }
            } else if(!isNaN(data)) {
                record = this.records[data] || null;
            } else if(typeof data === 'string') {
                for(let id in this.records) if(this.records[id].get('name') === data) {
                    record = self.records[id];
                    break;
                }
            }
            return record;
        };

        Table.prototype.store = function(record, id) {
            if(record.deleted) {
                delete this.records[id];
            }
            if(id != record.id) {
                this.records[id].oldId = id;
                this.records[record.id] = this.records[id];
                delete this.records[id];
            }
            if(!this.records[record.id]) this.records[record.id] = new this.type();

            this.records[record.id].update(record);
        };

        Table.prototype.each = function(callback) {
            for(let id in this.records) {
                if(callback.call(this.records[id], this.records[id], id) === false) return false;
            }
            return true;
        };

        Table.prototype.create = function(data, type) {
            type = type || this.type;
            let record = new type();
            record.set('id', this.nextId--);
            this.records[record.getId()] = record;

            if(typeof data === 'object') for(let key in data) {
                record.set(key, data[key]);
            }
            return record;
        };

        Table.prototype.delete = function(id, permanent) {
            if(permanent) {
                delete this.records[id];
            } else {
            }
        };


        function Record() {
        }

        Record.prototype.getId = function() {
            return this.id;
        };

        Record.prototype.get = function(key) {
            return this[key];
        };

        Record.prototype.set = function(key, value) {
            this[key] = value;
        };

        Record.prototype.each = function(field, callback) {
            for(let id in this[field]) {
                if(callback.call(this, this[field][id]) === false) return false;
            }
            return true;
        }

        Record.prototype.update = function(data) {
            let self = this;
            if(data.id) self.set('id', data.id);
            for(let key in data) {
                if(key == 'id') continue;
                self.set(key, data[key]);
            }
            self.updatePage();
            delete this.oldId;
        };

        Record.prototype.updatePage = function() {
        };

        Record.prototype.delete = function() {
            if(this.deleted) return;
            this.deleted = true;
            this.table.delete(this.id);
        };


        function Concept() {
            Record.prototype.constructor.call(this);
            this.table = Concept.table;
        }
        Concept.prototype = Object.create(Record.prototype);
        Concept.constructor = Concept;

        function c(data) {
            return Concept.table.get(data);
        }

        Concept.prototype.getName = function() {
            return this.get('name');
        };
        Concept.prototype.getDescription = function() {
            return this.get('description');
        };


        function Part(concept) {
            Record.prototype.constructor.call(this);
            this.table = Part.table;
            this.concept = concept || null;
            this.neighbors = {'incoming': {}, 'outgoing': {}};
        }

        Part.prototype.getConcept = function() {
            return this.concept;
        };

        Part.prototype.isNeighbor = function(part, direction) {
            return this.neighbors[direction][part.getId()] ? true : false;
        };

        Part.prototype.eachNeighbor = function(callback, directions) {
            directions = directions || ['incoming', 'outgoing'];
            for(let direction in directions) {
                for(let id in this.neighbors[direction]) {
                    if(callback.call(this.neighbors[id], this.neighbors[id], direction)) return false;
                }
            }
            return true;
        };

        Part.prototype.getNeighborsViaLink = function(linkConcept, direction) {
            let self = this, neighbors = [];
            self.eachNeighbor(function(neighbor, dir) {
                if(dir === direction && neighbor instanceof Link && neighbor.getConcept() === linkConcept)
                    neighbors.push(neighbor.getEndpoint(direction));
            });
            return neighbors;
        };


        function Node(concept) {
            Part.prototype.constructor.call(this, concept);
        }
        Node.prototype = Object.create(Part.prototype);
        Node.constructor = Node;


        function Link(concept) {
            Part.prototype.constructor.call(this, concept);
            this.start = null;
            this.end = null;
        }
        Link.prototype = Object.create(Part.prototype);
        Link.constructor = Link;

        Link.prototype.getStart = function() {
            return this.start;
        };

        Link.prototype.getEnd = function() {
            return this.end;
        };

        Link.prototype.getEndpoint = function(direction) {
            if(direction === 'incoming') return this.start;
            if(direction === 'outgoing') return this.end;
            return null;
        };



























