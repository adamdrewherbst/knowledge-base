/*
    databaseWrappers.js - Adam Herbst 4/23/19

    This file's main purpose is to specify the wrapper classes for the database tables.  These tables are
    specified in /models/db.py.  When we load a database entry from the server, the 'storeEntries' function in this
    file is called.  That function creates an object in memory to hold the entry so we don't have to load it every time
    we need to reference it.  The prototype of the created object corresponds to the table it is from.  For example,
    when we load a concept, a Concept object (defined below) is created.  All fields from the database are stored in the
    object, and its prototype has functions allowing it to perform actions specific to that table.  For example, the
    Concept prototype has an 'instanceOf' function to check whether that concept is an instance of another specified concept.

    All table-specific wrapper classes inherit from the generic Entry class.  This defines basic functions like storing data
    fields passed from the server, and adding event handlers to be fired when the record is updated in a certain way.

    The short Misc library is also defined here since it is used several times by the wrapper classes, although it is used
    in other files as well, especially nodeData.js.  It simplifies common operations on JavaScript objects like adding a
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


        Page.getTable = function(name) {
            return Page.tables[name];
        };

        Page.loadConcept = function(concept, callback) {
            $.ajax({
                url: Page.loadConceptURL,
                dataType: 'json',
                data: {
                    table: 'concept',
                    id: concept
                },
                success: function(data) {
                    Page.parseRecords(data);
                    if(typeof callback === 'function') callback.call(Page, data);
                }
            });
        };

        Page.parseRecords = function(data) {
            for(let table in data) {
                for(let id in data[table]) {
                    let record = data[table][id];
                    Page.getTable(table).storeRecord(record);
                }
            }
        };

        Page.getConcept = function(info) {
            if(info instanceof go.Node) {
                info = info.data.id;
            }
            if(!isNaN(info)) {
                return Page.getTable('concept').findRecord(info);
            }
        };

        Page.createConcept = function() {
            return Page.getTable('concept').newRecord();
        };


        function Table(constructor) {
            this.class = constructor;
            this.records = {};
            this.nextId = -1;
        }

        Table.prototype.storeRecord = function(record) {
            let self = this;

            if(!self.records[record.id]) self.records[record.id] = new self.class();

            self.records[record.id].update(record);
        };

        Table.prototype.findRecord = function(info) {
            let self = this, record = null;

            if(info instanceof this.class) record = info;
            else if(!isNaN(info)) record = self.records[info] || null;

            return record;
        };

        Table.prototype.newRecord = function() {
            let record = new this.class();
            record.set('id', this.nextId--);
            this.records[record.getId()] = record;
            return record;
        };


        function Record() {
        }

        Record.prototype.update = function(data) {
            let self = this;
            if(data.id) self.set('id', data.id);
            for(let key in data) {
                if(key == 'id') continue;
                self.set(key, data[key]);
            }
        };

        Record.prototype.get = function(field) {
            return this[field];
        };

        Record.prototype.getId = function() {
            return this.id;
        };

        Record.prototype.set = function(field, value) {
            let self = this;

            let desc = self.getFieldDescription(field), values = [];

            if(typeof desc.type === 'function') {
                let table = desc.type.table;
                if(typeof value === 'object' && !(value instanceof Record)) {
                    for(let id in value) values.push(table.findRecord(id));
                } else values.push(table.findRecord(value));
            } else if(desc.type === 'number') {
                values.push(parseFloat(value));
            } else {
                values.push(value);
            }

            values.forEach(function(val) {

                if(desc.multiple) {
                    if(Array.isArray(self[field])) self[field].push(val);
                    else {
                        if(!self[field]) self[field] = {};
                        if(value instanceof Record) {
                            if(self[field][val.getId()] === val) return true;
                            self[field][val.getId()] = value;
                        } else {
                            if(self[field][val]) return true;
                            self[field][val] = true;
                        }
                    }
                } else {
                    if(self[field] === val) return true;
                    self[field] = val;
                }

                // see if this field is bound to a complement field of another record
                if(val instanceof Record && desc.complement) {
                    val.set(desc.complement, self);
                }

            });
        };

        Record.prototype.getFieldDescription = function(field) {
            return this.constructor.fields[field] || {};
        };


        function Concept() {
            Record.constructor.call(this);
            this.predicates = {};
        }
        Concept.prototype = Object.create(Record.prototype);
        Concept.prototype.constructor = Concept;

        function c(id) {
            return Page.getConcept(id);
        }
        function n(id) {
            let concept = Page.getConcept(id);
            if(concept) return concept.getNode();
            return null;
        }

        Concept.setFields = function() {
            add(Concept, 'head', Concept);
            add(Concept, 'head_of', Concept, true);
            add(Concept, 'reference', Concept);
            add(Concept, 'reference_of', Concept, true);
            add(Concept, 'instance_of', Concept, true);
            add(Concept, 'instance', Concept, true);
        };

        Concept.setBindings = function() {
            bind(Concept, 'head', Concept, 'head_of');
            bind(Concept, 'reference', Concept, 'reference_of');
            bind(Concept, 'instance_of', Concept, 'instance');
        };

        function add(name, field, type, multiple) {
            if(!name.fields) name.fields = {};
            name.fields[field] = {
                type: type,
                multiple: multiple
            }
        }

        function bind(class1, field1, class2, field2, multiple1, multiple2) {
            class1.fields[field1].complement = field2;
            class2.fields[field2].complement = field1;
        }

        Concept.prototype.set = function(field, value) {
            let self = this;

            switch(field) {
                case 'predicate':
                    value.split(',').forEach(function(predicate) {
                        self.addToPredicate(predicate);
                    });
                    break;
                default:
                    Record.prototype.set.call(this, field, value);
                    break;
            }
        };

        Concept.prototype.getName = function() {
            return this.get('name');
        };

        Concept.prototype.getHead = function() {
            let head = this.get('head');
            if(head && head.isRelation()) return null;
            return head;
        };

        Concept.prototype.setHead = function(concept) {
            this.set('head', concept);
        };

        Concept.prototype.getHeadOf = function() {
            return Misc.toArray(this.head_of);
        };

        Concept.prototype.setAsHead = function(concept) {
            this.set('head_of', concept);
        };

        Concept.prototype.getReference = function() {
            let reference = this.get('reference');
            if(reference && reference.isRelation()) return null;
            return reference;
        };

        Concept.prototype.setReference = function(concept) {
            this.setLink('reference', concept);
        };

        Concept.prototype.getReferenceOf = function(concept) {
            return Misc.toArray(this.reference_of);
        };

        Concept.prototype.setAsReference = function(concept) {
            this.setLink('reference_child', concept);
        };

        Concept.prototype.getInstanceOf = function() {
            return Misc.toArray(this.instance_of);
        };

        Concept.prototype.getAllInstanceOf = function() {
            return Misc.toArray(this.instance_of_all);
        };

        Concept.prototype.addInstanceOf = function(concept) {
            this.setLink('instance_of', concept);
        };

        Concept.prototype.getInstances = function() {
            return Misc.toArray(this.instance);
        };

        Concept.prototype.addInstance = function(concept) {
            this.setLink('instance', concept);
        };

        Concept.prototype.addToPredicate = function(predicate) {
            let self = this;
            self.predicates[predicate] = true;
        };

        Concept.prototype.removeFromPredicate = function(predicate) {
            let self = this;
            delete self.predicates[predicate];
        };

        Concept.prototype.updateMatches = function() {
            let self = this;

            let predicates = {}, checked = {};
            self.getAncestors().forEach(function(ancestor) {
                ancestor.getInstances().forEach(function(instance) {

                    // skip this concept if already checked
                    if(checked[instance.getId()] || self.matched(instance)) return true;
                    checked[instance.getId()] = true;

                    // make sure the concept is a predicate and I am an instance of it
                    if(!instance.isPredicate() || !self.instanceOf(instance)) return false;

                    // make sure my parents match the concept's parents if it has any
                    let head = self.getHead(),
                        ref = self.getReference(),
                        instanceHead = instance.getHead(),
                        instanceRef = instance.getReference();

                    if( (!instanceHead || (head && head.matched(instanceHead)))
                     && (!instanceRef || (ref && ref.matched(instanceRef))) )
                    {
                        // if it all checks out, mark this concept as a match
                        self.addMatch(instance);
                    }
                });
            });
        };

        Concept.prototype.addMatch = function(concept) {
            let self = this;
            self.matches[concept.getId()] = concept;
        };

        Concept.prototype.matched = function(concept) {
            return this.matches[concept.getId()] ? true : false;
        };

        Concept.prototype.instanceOf = function(concept) {
            let self = this;

            concept = Page.getConcept(concept);
            if(!concept) return false;

            if(concept.isPredicate()) {
                return concept.getParents().every(function(parent) {
                    return self.instanceOf(parent);
                });
            } else {
                return self.getAncestors().indexOf(concept) >= 0;
            }
        };

        Concept.prototype.isRelation = function() {
            return this.instanceOf('RELATION');
        };

        Concept.prototype.isPredicate = function() {
            return this.isPredicate;
        };

        Concept.prototype.sync = function() {
            let self = this;
            for(let id in self.parent) {
                let parent = self.parent[id];
                self.parents.push(parent);
                Object.assign(self.ancestor, parent.get('ancestor'));
            }
            for(let id in self.ancestor) {
                let ancestor = self.ancestor[id];
                self.ancestors.push(ancestor);
            }
        };

        Concept.prototype.inPredicate = function() {
            return this.predicates[Page.currentPredicate] ? true : false;
        };

        Concept.prototype.togglePredicate = function(include) {
            this.predicates[Page.currentPredicate] = include;
        };

        Concept.prototype.getInfoString = function() {
            return '';
        };

        Concept.prototype.getSymbol = function() {
            return '';
        };
