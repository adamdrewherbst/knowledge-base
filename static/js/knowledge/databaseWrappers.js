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
            for(let id in data.concept) {
                let concept = data.concept[id];
                Concept.store(concept, id);
            }
            for(let id in data.link) {
                let link = data.link[id], start = Concept.get(link.start), end = Concept.get(link.end);
                if(start && end) start.addContext(end);
            }
            for(let id in data.instance) {
                let instance = data.instance[id], concept = Concept.get(instance.concept),
                    instanceOf = Concept.get(instance.instance_of);
                if(concept && instanceOf) concept.makeInstanceOf(instanceOf);
            }
        };

        Page.saveChanges = function() {
            let records = {concept: {}, link: [], instance: []}, lid = 0, iid = 0;
            Concept.each(function(concept) {
                records.concept[concept.getId()] = {
                    name: concept.name,
                    description: concept.description,
                    link: concept.link,
                    singular: concept.singular,
                    predicate: concept.predicate,
                    aggregator: concept.aggregator,
                    group: concept.group
                };
                concept.eachContext(function(context) {
                    records.link[lid++] = {
                        start: concept.getId(),
                        end: context.getId()
                    };
                });
                concept.eachInstanceOf(function(instanceOf) {
                    records.instance[iid++] = {
                        concept: concept.getId(),
                        instance_of: instanceOf.getId()
                    };
                });
            });
            $.ajax({
                url: Page.saveURL,
                type: 'post',
                dataType: 'json',
                data: JSON.stringify({records: records}),
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
            this.context = {};
            this.context_of = {};
            this.instance = {};
            this.instance_of = {};
            this.ancestors = {};
        }
        Concept.prototype = Object.create(Record.prototype);
        Concept.prototype.constructor = Concept;

        Concept.get = function(data) {
            return Concept.table.findRecord(data);
        };
        Concept.create = function(data) {
            return Concept.table.newRecord(data);
        };
        Concept.store = function(data) {
            return Concept.table.storeRecord(data);
        };
        Concept.each = function(callback) {
            return Concept.table.eachRecord(callback);
        };

        function c(id) {
            return Concept.get(id);
        }

        Concept.prototype.set = function(field, value, doSet) {
            Record.prototype.set.call(this, field, value);
        };

        Concept.prototype.getContext = function() {
            return Misc.toArray(this.context);
        };

        Concept.prototype.makeContext = function(concept, isContext) {
            isContext = isContext === undefined || isContext;
            if(isContext) {
                this.context[concept.getId()] = concept;
            } else {
                delete this.context[concept.getId()];
            }
            concept.makeContextOf(this, isContext);
        };

        Concept.prototype.eachContext = function(callback) {
            for(let c in this.context) {
                if(callback.call(this, this.context[c]) === false) return false;
            }
            return true;
        };

        Concept.prototype.makeContextOf = function(concept, isContextOf) {
            isContextOf = isContextOf === undefined || isContextOf;
            if(isContextOf) {
                this.context_of[concept.getId()] = concept;
            } else {
                delete this.context_of[concept.getId()];
            }
        };

        Concept.prototype.eachContextOf = function(callback) {
            for(let c in this.context_of) {
                if(callback.call(this, this.context_of[c]) === false) return false;
            }
            return true;
        };

        Concept.prototype.eachInTree = function(callback, tree) {
            tree = tree || {};
            let self = this;
            if(tree[self.getId()]) return true;
            tree[self.getId()] = self;
            if(callback.call(self, self) === false) return false;
            return self.eachContextOf(function(contextOf) {
                return contextOf.eachInTree(callback, tree);
            })
        };

        Concept.prototype.getTreeCount = function() {
            let count = 0;
            this.eachInTree(function() {
                count++;
            });
            return count;
        };

        Concept.prototype.instanceOf = function(concept) {
            concept = Concept.get(concept);
            return this.ancestors[concept.getId()] ? true : false;
        };

        Concept.prototype.makeInstanceOf = function(concept, isInstance) {
            isInstance = isInstance || isInstance === undefined;
            if(isInstance) {
                this.instance_of[concept.getId()] = concept;
                this.makeAncestor(concept, true);
            } else {
                delete this.instance_of[concept.getId()];
                this.makeAncestor(concept, false);
                for(let c in this.instance_of) {
                    this.makeAncestor(this.instance_of[c], true);
                }
            }
        };

        Concept.prototype.eachInstanceOf = function(callback) {
            for(let i in this.instance_of) {
                if(callback.call(this, this.instance_of[i]) === false) return false;
            }
            return true;
        };

        Concept.prototype.makeAncestor = function(concept, isAncestor) {
            isAncestor = isAncestor === undefined || isAncestor;
            let self = this;
            if(isAncestor) {
                self.ancestor[concept.getId()] = concept;
                concept.makeInstance(self, true);
                concept.eachAncestor(function(ancestor) {
                    self.ancestor[ancestor.getId()] = ancestor;
                    ancestor.makeInstance(self, true);
                });
            } else {
                delete self.ancestor[concept.getId()];
                concept.makeInstance(self, false);
                concept.eachAncestor(function(ancestor) {
                    delete self.ancestor[ancestor.getId()];
                    ancestor.makeInstance(self, false);
                });
            }
        };

        Concept.prototype.eachAncestor = function(callback) {
            for(let a in this.ancestor) {
                if(callback.call(this, this.ancestor[a]) === false) return false;
            }
            return true;
        };

        Concept.prototype.makeInstance = function(concept, isInstance) {
            if(isInstance) this.instance[concept.getId()] = concept;
            else delete this.instance[concept.getId()];
        };

        Concept.prototype.eachInstance = function(callback) {
            for(let i in this.instance) {
                if(callback.call(this, this.instance[i]) === false) return false;
            }
            return true;
        };

        Concept.prototype.isLaw = function() {
            return this.instanceOf('LAW');
        };

        Concept.prototype.makeLaw = function(doSet) {
            this.makeInstanceOf('LAW', doSet);
        };

        Concept.prototype.isPredicate = function() {
            return !isNaN(this.predicate);
        };

        Concept.prototype.togglePredicate = function(include) {
            this.predicate = include === undefined ? !this.predicate : include;
            this.updateNodes();
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



