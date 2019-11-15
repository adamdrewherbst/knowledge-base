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
                if(concept && instanceOf) concept.addInstanceOf(instanceOf);
            }
        };

        Page.saveChanges = function() {
            let records = {concept: {}, link: {}, instance: {}}, lid = 0, iid = 0;
            Concept.each(function(concept, id) {
                records.concept[id] = {
                    name: concept.name,
                    description: concept.description,
                    is_link: concept.is_link,
                    is_law: concept.is_law,
                    is_singular: concept.is_singular,
                    predicate: concept.predicate,
                    aggregator: concept.aggregator,
                    type: concept.type
                };
                if(id > 0) records.concept[id].id = id;
                concept.eachContext(function(context) {
                    records.link[lid++] = {
                        start: id,
                        end: context.getId()
                    };
                });
                concept.eachInstanceOf(function(instanceOf) {
                    records.instance[iid++] = {
                        concept: id,
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


        function Concept() {
            this.context = {};
            this.context_of = {};
            this.instance = {};
            this.instance_of = {};
            this.ancestors = {};
            this.saved = {};
        }
        Concept.records = {};
        Concept.nextId = -1;

        Concept.references = ['instance', 'instance_of', 'context', 'context_of', 'ancestor', 'ancestor_of'];
        Concept.getComplement = function(field) {
            return field.indexOf('_of') >= 0 ? field.substring(0, field.length-3) : field + '_of';
        }

        Concept.get = function(data) {
            let record = null;
            if(data instanceof Concept) {
                record = data;
            } else if(data instanceof go.GraphObject) {
                let part = data.part ? data.part : data;
                if(part instanceof go.Node) {
                    let id = part.data ? part.data.id : null;
                    if(id) record = Concept.records[id] || null;
                }
            } else if(!isNaN(data)) {
                record = Concept.records[data] || null;
            } else if(typeof data === 'string') {
                for(let id in Concept.records) if(Concept.records[id].get('name') === data) {
                    record = self.records[id];
                    break;
                }
            }
            return record;
        };

        Concept.create = function(data) {
            let record = new Concept();
            record.set('id', Concept.nextId--);
            Concept.records[record.getId()] = record;

            if(typeof data === 'object') for(let key in data) {
                record.set(key, data[key]);
            }
            return record;
        };

        Concept.store = function(record, id) {

            if(record.deleted) {
                Concept.delete(id, true);
                return;
            }
            if(id != record.id) {
                Concept.records[id].oldId = id;
                Concept.records[record.id] = Concept.records[id];
                delete Concept.records[id];
            }
            if(!Concept.records[record.id]) Concept.records[record.id] = new Concept();

            Concept.records[record.id].update(record);
        };

        Concept.each = function(callback) {
            for(let id in Concept.records) {
                if(callback.call(Concept.records[id], Concept.records[id], id) === false) return false;
            }
            return true;
        };

        Concept.delete = function(id, permanent) {
            if(permanent) {
                delete Concept.records[id];
            } else {
            }
        };

        function c(id) {
            return Concept.get(id);
        }


        Concept.prototype.get = function(field) {
            let value = this[field];
            if(value && typeof value === 'object' && !Array.isArray(value))
                return Misc.toArray(value);
            return value;
        };

        Concept.prototype.set = function(field, value, include, postprocess) {

            include = include === undefined || include;
            postprocess = postprocess === undefined || postprocess;
            let self = this;

            if(Concept.references.includes(field)) {

                let values = Array.isArray(value) ? value : [value];
                values.forEach(function(val) {
                    if((include && self[field][val.getId()]) || (!include && !self[field][val.getId()]))
                        return;

                    if(include) {
                        self[field][val.getId()] = val;
                    } else {
                        delete self[field][val.getId()];
                    }
                    if(postprocess) val.set(Concept.getComplement(field), self, include);
                });
            } else {
                if(include) {
                    self[field] = value;
                }
            }

            if(postprocess) switch(field) {
                case 'context':
                    if(include) self.setLaw(value.getLaw());
                    else {
                        self.setLaw(null);
                        self.eachContext(function(concept) {
                            if(concept.inLaw()) {
                                self.setLaw(concept.getLaw());
                                return false;
                            }
                        });
                    }
                    break;
                case 'instance_of':
                    if(include) {
                        self.set('ancestor', value);
                        self.set('ancestor', value.get('ancestor'));
                    } else {
                        self.ancestor = {};
                        self.eachInstanceOf(function(concept) {
                            self.set('ancestor', concept);
                            self.set('ancestor', concept.get('ancestor'));
                        });
                    }
                    break;
                case 'name':
                case 'is_law':
                case 'is_link':
                    self.updateNodes();
                    break;
            }
        };

        Concept.prototype.each = function(field, callback) {
            for(let id in this[field]) {
                if(callback.call(this, this[field][id]) === false) return false;
            }
            return true;
        };

        Concept.prototype.update = function(data) {
            let self = this;
            if(data.id) self.set('id', data.id);
            for(let key in data) {
                if(key == 'id') continue;
                self.set(key, data[key]);
            }
            self.updateNodes();
            delete this.oldId;
        };

        Concept.prototype.getId = function() {
            return this.id;
        };
        Concept.prototype.getName = function() {
            return this.get('name');
        };
        Concept.prototype.getDescription = function() {
            return this.get('description');
        };
        Concept.prototype.getContext = function() {
            return this.get('context');
        };
        Concept.prototype.addContext = function(concept) {
            this.set('context', concept);
        };
        Concept.prototype.removeContext = function(concept) {
            this.set('context', concept, false);
        };
        Concept.prototype.eachContext = function(callback) {
            return this.each('context', callback);
        };
        Concept.prototype.eachContextOf = function(callback) {
            return this.each('context_of', callback);
        };
        Concept.prototype.addInstanceOf = function(concept) {
            this.set('instance_of', concept);
        };
        Concept.prototype.removeInstanceOf = function(concept) {
            this.set('instance_of', concept, false);
        };
        Concept.prototype.eachInstance = function(callback) {
            return this.each('instance', callback);
        };
        Concept.prototype.eachInstanceOf = function(callback) {
            return this.each('instance_of', callback);
        };
        Concept.prototype.eachAncestor = function(callback) {
            return this.each('ancestor', callback);
        };
        Concept.prototype.eachAncestorOf = function(callback) {
            return this.each('ancestor_of', callback);
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

        Concept.prototype.isLaw = function() {
            return this.get('is_law');
        };

        Concept.prototype.isLink = function() {
            return this.get('is_link');
        };

        Concept.prototype.isPredicate = function() {
            return !isNaN(this.predicate);
        };

        Concept.prototype.makePredicate = function(predicate, isPredicate) {
            this.predicate = isPredicate === undefined || isPredicate ? predicate : null;
        };

        Concept.prototype.getLaw = function() {
            return this.get('law');
        };

        Concept.prototype.setLaw = function(concept) {
            let self = this;
            self.set('law', concept);
            self.eachContextOf(function(child) {
                child.setLaw(concept);
            });
        };

        Concept.prototype.getInfoString = function() {
            return '';
        };

        Concept.prototype.getSymbol = function() {
            return '';
        };

        Concept.prototype.delete = function() {

            let self = this;
            if(self.deleted) return;
            self.deleted = true;

            Concept.references.forEach(function(field) {
                self.saved[field] = self[field];
                for(let id in self[field]) {
                    self[field][id].set(Concept.getComplement(field), self, false, false);
                }
                self[field] = {};
            });

            self.eachContextOf(function(child) {
                if(child.getContext().length === 0) {
                    child.delete();
                }
            });

            Concept.delete(self.getId());
        };


