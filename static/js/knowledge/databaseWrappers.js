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


        Page.getTable = function(name) {
            return Page.tables[name];
        };

        Page.load = function(data, callback) {
            let concepts = [];
            switch(typeof data) {
                case 'string':
                case 'number':
                    concepts.push(data);
                    break;
                case 'object':
                    concepts = data;
                    break;
            }
            $.ajax({
                url: Page.loadURL,
                type: 'post',
                dataType: 'json',
                data: JSON.stringify({
                    concepts: concepts
                }),
                success: function(data) {
                    Page.storeRecords(data);
                    if(typeof callback === 'function') callback.call(Page, data);
                }
            });
        };

        Page.storeRecords = function(data) {
            for(let table in data) {
                for(let id in data[table]) {
                    let record = data[table][id];
                    Page.getTable(table).storeRecord(record, id);
                }
            }
        };

        Page.saveChanges = function() {
            let data = {records: {concept: {}, link: {}}},
                tables = [Concept.table, Link.table];
            tables.forEach(function(table) {
                let tableName = table.getName();
                table.eachRecord(function(record) {
                    let newRecord = {};
                    if(record.deleted) {
                        if(record.getId() > 0)
                            newRecord.deleted = true;
                    } else {
                        newRecord.name = record.getName();
                        newRecord.description = record.getDescription()
                        let other = {};
                        other.predicate = record.predicate;
                        switch(tableName) {
                            case 'concept':
                                other.aggregator = record.aggregator;
                                break;
                            case 'link':
                                newRecord.start = record.getStartId();
                                newRecord.end = record.getEndId();
                                other.link_class = record.link_class;
                                break;
                        }
                        newRecord.other = JSON.stringify(other);
                    }
                    data.records[tableName][record.id] = newRecord;
                });
            });
            $.ajax({
                url: Page.saveURL,
                type: 'post',
                dataType: 'json',
                data: JSON.stringify(data),
                success: function(data) {
                    Page.storeRecords(data);
                }
            });
        };


        function Table(name, constructor) {
            this.name = name;
            this.class = constructor;
            this.records = {};
            this.nextId = -1;
        }

        Table.prototype.getName = function() {
            return this.name;
        };

        Table.prototype.storeRecord = function(record, id) {
            let self = this;

            if(record.deleted) {
                self.deleteRecord(id, true);
                return;
            }
            if(id != record.id) {
                self.records[record.id] = self.records[id];
                delete self.records[id];
            }
            if(!self.records[record.id]) self.records[record.id] = new self.class();

            self.records[record.id].update(record);
        };

        Table.prototype.findRecord = function(info) {
            let self = this, record = null;

            if(info instanceof this.class) record = info;
            else if(!isNaN(info)) record = self.records[info] || null;
            else if(typeof info === 'string') {
                for(let id in self.records) if(self.records[id].get('name') === info) {
                    record = self.records[id];
                    break;
                }
            }

            return record;
        };

        Table.prototype.newRecord = function() {
            let record = new this.class();
            record.set('id', this.nextId--);
            this.records[record.getId()] = record;
            return record;
        };

        Table.prototype.eachRecord = function(callback) {
            for(let id in this.records) {
                callback.call(this.records[id], this.records[id], id);
            }
        };

        Table.prototype.deleteRecord = function(id, permanent) {
            if(permanent) {
                delete this.records[id];
            } else {

            }
        };


        function Record() {
            this.saved = {};
        }

        Record.prototype.getTable = function() {
            return this.constructor.table;
        };

        Record.prototype.get = function(field) {
            return this[field];
        };

        Record.prototype.getId = function() {
            return this.id;
        };

        Record.prototype.getName = function() {
            return this.get('name');
        };

        Record.prototype.getDescription = function() {
            return this.get('description');
        };

        Record.prototype.set = function(field, value) {
            this[field] = value;
        };

        Record.prototype.update = function(data) {
            let self = this;
            if(data.id) self.set('id', data.id);
            for(let key in data) {
                if(key == 'id') continue;
                self.set(key, data[key]);
            }
            self.updatePage();
        };

        Record.prototype.updatePage = function() {
            let self = this, table = self.getTable().getName();
            Page.eachActiveDiagram(function(diagram) {
                let part = null, newData = {
                    id: self.getId(),
                    name: self.get('name'),
                    predicate: self.get('predicate')
                };
                switch(table) {
                    case 'concept':
                        part = diagram.findNodeForKey(self.getId());
                        newData.aggregator = self.get('aggregator');
                        break;
                    case 'link':
                        part = diagram.findLinkForKey(self.getId());
                        newData.start = self.get('start');
                        newData.end = self.get('end');
                        break;
                }
                if(part && newData) {
                    for(let k in newData)
                        diagram.model.set(part.data, k, newData[k]);
                    part.updateTargetBindings();
                }
            });
        };

        Record.prototype.delete = function() {
            let self = this;
            if(self.deleted) return;
            self.deleted = true;
            for(let field in self) {
                let desc = self.getFieldDescription(field);
                if(!desc.complement) continue;
                self.saved[field] = self[field];
                self.eachValue(field, function(val) {
                    if(val instanceof Record)
                        val.unset(desc.complement, self);
                });
            }
            self.getTable().deleteRecord(self);
        };


        function Concept() {
            Record.prototype.constructor.call(this);
            this.links = {start: {}, end: {}};
        }
        Concept.prototype = Object.create(Record.prototype);
        Concept.prototype.constructor = Concept;

        Concept.get = function(data) {
            return Concept.table.findRecord(data);
        };
        Concept.create = function(data) {
            return Concept.table.newRecord(data);
        };
        function c(id) {
            return Concept.get(id);
        }

        Concept.prototype.set = function(field, value, doSet) {
            Record.prototype.set.call(this, field, value);
        };

        Concept.prototype.addLink = function(link, position) {
            this.links[position][link.getId()] = link;
        };

        Concept.prototype.removeLink = function(link, position) {
            delete this.links[position][link.getId()];
        };

        Concept.prototype.setLink = function(type, concept, doSet) {
            let self = this;
            let found = self.eachOutLink(function(link) {
                if(link.isType(type) && link.end() === concept) {
                    if(!doSet) self.removeLink('start', link);
                    return false;
                }
            })
            if(doSet && !found) {
                Link.create({
                    type: type,
                    start: self,
                    end: concept
                });
            }
        };

        Concept.prototype.eachOutLink = function(callback) {
            for(let lid in this.links.start) {
                if(callback.call(this, this.links.start[lid]) === false) return false;
            }
            return true;
        };

        Concept.prototype.isPredicate = function() {
            return this.predicate;
        };

        Concept.prototype.togglePredicate = function(include) {
            this.predicate = include === undefined ? !this.predicate : include;
            this.updateNodes();
        };

        Concept.prototype.isLaw = function() {
            return this.hasLink('instance_of', 'LAW');
        };

        Concept.prototype.setAsLaw = function(isLaw) {
            let self = this;
            self.setLink('instance_of', 'LAW', isLaw);
            self.setLaw(self);
            self.updateNodes();
        };

        Concept.prototype.getLaw = function() {
            return this.get('law');
        };

        Concept.prototype.setLaw = function(concept) {
            let self = this;
            self.set('law', concept);
            self.getContextOf().forEach(function(child) {
                child.setLaw(concept);
            });
        };

        Concept.prototype.getInfoString = function() {
            return '';
        };

        Concept.prototype.getSymbol = function() {
            return '';
        };


        function Link() {
            Record.prototype.constructor.call(this);
        }
        Link.prototype = Object.create(Record.prototype);
        Link.prototype.constructor = Link;

        Link.get = function(data) {
            return Link.table.findRecord(data);
        };
        Link.create = function(data) {
            return Link.table.newRecord(data);
        };

        Link.prototype.getStartId = function() {
            return this.start ? this.start.getId() : null;
        };

        Link.prototype.getEndId = function() {
            return this.end ? this.end.getId() : null;
        };

        Link.prototype.set = function(key, val) {
            switch(key) {
                case 'start':
                case 'end':
                    let oldConcept = Concept.get(this[key]), concept = Concept.get(val);
                    if(oldConcept === concept) return;
                    this[key] = concept;
                    if(oldConcept) oldConcept.removeLink(this, key);
                    if(concept) concept.addLink(this, key);
                    break;
                default: Record.prototype.set.call(this, key, val);
                    break;
            }
        };













