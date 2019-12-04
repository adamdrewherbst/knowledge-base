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

        var Misc = {

            each: function(obj, callback) {
                if(Object.keys(obj).length === 0) return true;
                let ret = true;
                $.each(obj, function(key, val) {
                    if(callback.call(val, val) === false) {
                        ret = false;
                        return false;
                    }
                });
                return ret;
            }

        };

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
        /*Misc.each = function(obj, callback, key) {
            if(!obj || typeof obj !== 'object') return;
            let stop = callback.call(obj, obj, key);
            if(stop === true) return;
            for(let k in obj) {
                if(stop && typeof stop === 'object' && stop[k]) continue;
                if(obj[k] && typeof obj[k] === 'object')
                    Misc.each(obj[k], callback, k);
            }
        };*/

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
                data: JSON.stringify({all: true}),
                success: function(data) {
                    Page.store(data);
                    if(typeof callback === 'function') callback.call(Page, data);
                }
            });
        };

        Page.save = function() {
            let records = {concept: {}, part: {}};
            Page.eachTable(function(table, name) {
                table.each(function(record, id) {
                    if(record.deleted) {
                        if(id > 0) records[name][id] = { id: id, deleted: true };
                    } else {
                        if(record instanceof Concept) {
                            records.concept[id] = {
                                name: record.name,
                                description: record.description,
                            };
                        } else if(record instanceof Part) {
                            records.part[id] = {
                                concept: record.getConceptId(),
                                start: record.getStartId(),
                                end: record.getEndId()
                            };
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
            Concept.table.store(data.concept);
            Part.table.store(data.part);
            Part.updateNeighbors();
        };


        function Table(type) {
            this.type = type;
            this.records = {};
            this.nextId = -1;

            Page.tables[type.tableName] = this;
        }

        Table.prototype.get = function(data) {
            let record = null;
            if(data instanceof this.type) {
                record = data;
            } else if(data instanceof go.GraphObject) {
                let part = data.part ? data.part : data;
                if(part instanceof go.Node || part instanceof go.Link) {
                    let id = part.data ? part.data.id : null;
                    if(id) record = this.records[id] || null;
                }
            } else if(!isNaN(data)) {
                record = this.records[data] || null;
            } else if(typeof data === 'string') {
                for(let id in this.records) if(this.records[id].get('name') === data) {
                    record = this.records[id];
                    break;
                }
            }
            return record;
        };

        Table.prototype.store = function(records) {
            records.stored = {};
            for(let id in records) {
                if(id === 'stored') continue;
                this.storeRecord(records, id);
            }
        };

        Table.prototype.storeRecord = function(records, id) {
            let record = records[id];

            if(records.stored[id]) return;
            records.stored[id] = true;

            console.log('storing ' + this.type.tableName + ' ' + id);
            console.log(record);

            if(record.deleted) {
                delete this.records[id];
                return;
            }

            if(this.type === Part) {
                if(record.start) this.storeRecord(records, record.start);
                if(record.end) this.storeRecord(records, record.end);
            }

            if(record.oldId) {
                this.records[id] = this.records[record.oldId];
                delete this.records[record.oldId];
            }
            if(!this.records[id]) this.records[id] = new this.type();

            this.records[id].update(record);
            if(this.records[id].oldId !== undefined) {
                this.records[id].updatePage();
                delete this.records[id].oldId;
            }
        };

        Table.prototype.each = function(callback) {
            for(let id in this.records) {
                if(callback.call(this.records[id], this.records[id], id) === false) return false;
            }
            return true;
        };

        Table.prototype.create = function(data) {
            let record = new this.type();
            record.set('id', this.nextId--);
            this.records[record.getId()] = record;
            record.update(data);
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
            if(typeof data === 'object') {
                if(data.id) self.set('id', data.id);
                for(let key in data) {
                    if(key == 'id') continue;
                    self.set(key, data[key]);
                }
            }
        };

        Record.prototype.updatePage = function() {
        };

        Record.prototype.delete = function() {
            if(this.deleted) return;
            this.deleted = true;
            this.table.delete(this.id);
            this.updatePage();
        };


        function Concept() {
            Record.prototype.constructor.call(this);
            this.table = Concept.table;
            this.node = null;
        }
        Concept.prototype = Object.create(Record.prototype);
        Concept.constructor = Concept;
        Concept.tableName = 'concept';
        Concept.table = new Table(Concept);

        Concept.get = function(data) {
            return Concept.table.get(data);
        };
        Concept.create = function(data) {
            return Concept.table.create(data);
        };
        function c(data) {
            return Concept.table.get(data);
        }

        Concept.prototype.getName = function() {
            return this.get('name');
        };
        Concept.prototype.setName = function(name) {
            this.set('name', name);
        };
        Concept.prototype.getDescription = function() {
            return this.get('description');
        };
        Concept.prototype.setDescription = function(description) {
            this.set('description', description);
        };

        Concept.prototype.getNode = function() {
            return this.node;
        };
        Concept.prototype.setNode = function(part) {
            this.node = part;
        };

        Concept.prototype.getLinks = function() {
            let self = this, links = [];
            Part.table.each(function(part) {
                if(part.isLink() && part.getConcept() === self) links.push(part);
            });
            return links;
        };

        Concept.prototype.getParts = function() {
            let self = this, parts = [];
            Part.table.each(function(part) {
                if(part.getConcept() === self) parts.push(part);
            });
            return parts;
        };

        Concept.prototype.eachPart = function(callback) {
            let self = this;
            Part.table.each(function(part) {
                if(part.getConcept() === self) {
                    if(callback.call(part, part) === false) return false;
                }
            });
            return true;
        };

        Concept.prototype.updatePage = function() {
            let self = this;

            self.eachPart(function(part) {
                Page.eachActiveDiagram(function(d) {
                    part.setGoData(d, {
                        name: self.name,
                        description: self.description
                    });
                });
            });
        };


        function Part() {
            Record.prototype.constructor.call(this);
            this.table = Part.table;
            this.neighbors = {'incoming': {}, 'outgoing': {}};
        }
        Part.prototype = Object.create(Record.prototype);
        Part.constructor = Part;
        Part.tableName = 'part';
        Part.table = new Table(Part);

        Part.get = function(data) {
            return Part.table.get(data);
        };
        Part.create = function(data) {
            let part = Part.table.create(data);
            if(!part.getConcept()) part.setConcept(Concept.create());
            return part;
        };
        function p(data) {
            return Part.table.get(data);
        }

        Part.opposite = function(direction) {
            if(direction === 'incoming') return 'outgoing';
            if(direction === 'outgoing') return 'incoming';
            return null;
        };

        Part.updateNeighbors = function() {
            let updates = {incoming: {}, outgoing: {}};
            Part.table.each(function(part) {
                for(let direction in updates) {
                    for(let id in part.neighbors[direction]) {
                        let neighbor = part.neighbors[direction][id], newId = neighbor.getId();
                        if(newId != id) updates[direction][id] = newId;
                    }
                    for(let id in updates[direction]) {
                        let newId = updates[direction][id];
                        part.neighbors[direction][newId] = part.neighbors[direction][id];
                        delete part.neighbors[direction][id];
                    }
                }
            });
        };


        Part.prototype.set = function(key, value) {
            switch(key) {
                case 'concept':
                    value = Concept.get(value);
                    break;
                case 'start':
                case 'end':
                    let current = this[key];
                    if(current instanceof Part)
                        this.setNeighbor(current, key === 'start' ? 'incoming' : 'outgoing', false);
                    value = Part.get(value);
                    break;
            }
            Record.prototype.set.call(this, key, value);
        };

        Part.prototype.update = function(data) {
            for(let key in data) this.set(key, data[key]);
            if(this.isNode()) {
                if(this.concept) this.concept.setNode(this);
            } else {
                this.setNeighbor(this.start, 'incoming');
                this.setNeighbor(this.end, 'outgoing')
            }
        };

        Part.prototype.delete = function() {
            let self = this;
            Record.prototype.delete.call(self);
            self.eachLink(function(link) {
                link.delete();
            });
            if(self.isNode() || self.isGeneral()) {
                self.concept.delete();
            }
        };

        Part.prototype.getConcept = function() {
            return this.concept;
        };
        Part.prototype.setConcept = function(concept) {
            this.concept = concept;
            if(!this.isLink()) concept.setNode(this);
        };
        Part.prototype.getConceptId = function() {
            return this.concept ? this.concept.getId() : null;
        };

        Part.prototype.getName = function() {
            return this.concept.getName();
        };

        Part.prototype.setName = function(name) {
            this.concept.setName(name);
            this.concept.updatePage();
        };

        Part.prototype.getDescription = function() {
            return this.concept.getDescription();
        };

        Part.prototype.setDescription = function(description) {
            this.concept.setDescription(description);
            this.concept.updatePage();
        };

        Part.prototype.matches = function(data) {
            if(data === '*') return true;
            if(!isNaN(data)) return this.getId() == data;
            if(data instanceof Part) return this === data;
            if(typeof data === 'string') {
                if(this.getName() === data) return true;
                let concept = Concept.get(data), node = null;
                if(concept) node = concept.getNode();
                if(node) return this.hasLink('is a', node);
            }
            return false;
        };

        Part.prototype.isNode = function() {
            return !this.start || !this.end;
        };
        Part.prototype.isLink = function() {
            return this.start && this.end;
        };
        Part.prototype.getStart = function() {
            return this.start;
        };
        Part.prototype.getStartId = function() {
            return this.start ? this.start.getId() : null;
        };
        Part.prototype.getEnd = function() {
            return this.end;
        };
        Part.prototype.getEndId = function() {
            return this.end ? this.end.getId() : null;
        };
        Part.prototype.getEndpoint = function(direction) {
            if(direction === 'incoming') return this.start;
            if(direction === 'outgoing') return this.end;
            return null;
        };
        Part.prototype.setEndpoints = function(start, end) {
            this.set('start', start);
            this.set('end', end);
        };

        Part.prototype.isGeneral = function() {
            let self = this;
            if(self.isNode()) {
                return !self.eachOutgoing(['in', '*'], function(context) {
                    return context.hasOutgoing(['is a', '*', 'in', 'META']);
                });
            } else if(self.isLink()) {
                return self.getStart().isGeneral() && self.getEnd().isGeneral();
            }
        };

        Part.prototype.setNeighbor = function(part, direction, include) {
            include = include === undefined || include;
            if(this.isNeighbor(part, direction) == include) return true;
            if(include) this.neighbors[direction][part.getId()] = part;
            else delete this.neighbors[direction][part.getId()];
            part.setNeighbor(this, Part.opposite(direction), include);
        };

        Part.prototype.isNeighbor = function(part, direction) {
            return this.neighbors[direction].hasOwnProperty(part.getId());
        };

        Part.prototype.eachNeighbor = function(directions, callback) {
            let self = this;
            if(typeof directions === 'function') {
                callback = directions;
                directions = undefined;
            }
            if(typeof directions === 'string') directions = [directions];
            if(!directions) directions = ['outgoing', 'incoming'];
            return directions.every(function(direction) {
                for(let id in self.neighbors[direction]) {
                    let neighbor = self.neighbors[direction][id];
                    if(callback.call(neighbor, neighbor, direction) === false) return false;
                }
                return true;
            });
        };

        Part.prototype.hasEndpoint = function(direction, chain, index) {
            let self = this;
            if(index === undefined) index = 0;
            if(index >= chain.length) return true;
            let data = chain[index];
            return !self.eachNeighbor(direction, function(neighbor) {
                return !(neighbor.matches(data) && neighbor.hasEndpoint(direction, chain, index+1));
            })
        };

        Part.prototype.firstEndpoint = function(direction, chain) {
            let endpoints = this.getEndpoints(direction, chain), keys = Object.keys(endpoints);
            if(keys.length === 0) return null;
            return endpoints[keys[0]];
        };

        Part.prototype.getEndpoints = function(direction, chain) {
            let self = this, parts = {}, neighbors = {};
            parts[self.id] = self;
            chain.forEach(function(data) {
                $.each(parts, function(p, part) {
                    for(let id in part.neighbors[direction]) {
                        let neighbor = part.neighbors[direction][id];
                        if(neighbor.matches(data)) {
                            neighbors[id] = neighbor;
                        }
                    }
                });
                parts = neighbors;
                neighbors = {};
            });
            return parts;
        };

        Part.prototype.eachEndpoint = function(direction, chain, callback) {
            let parts = this.getEndpoints(direction, chain);
            return Misc.each(parts, callback);
        };

        Part.prototype.hasIncoming = function(chain) {
            return this.hasEndpoint('incoming', chain);
        };

        Part.prototype.hasOutgoing = function(chain) {
            return this.hasEndpoint('outgoing', chain);
        };

        Part.prototype.getIncoming = function(chain) {
            return this.getEndpoints('incoming', chain);
        };

        Part.prototype.getChildren = function() {
            return this.getEndpoints('incoming', ['in', '*']);
        };

        Part.prototype.getExclusiveChildren = function() {
            let self = this, children = self.getChildren();
            $.each(children, function(c, child) {
                let exclusive = child.eachOutgoing(['in'], function(link) {
                    return link.getEnd() === self;
                });
                if(!exclusive) delete children[c];
            });
            return children;
        };

        Part.prototype.getOutgoing = function(chain) {
            return this.getEndpoints('outgoing', chain);
        };

        Part.prototype.eachIncoming = function(chain, callback) {
            return this.eachEndpoint('incoming', chain, callback);
        };

        Part.prototype.eachOutgoing = function(chain, callback) {
            return this.eachEndpoint('outgoing', chain, callback);
        };

        Part.prototype.hasLink = function(link, part) {
            return this.hasEndpoint('outgoing', [link, part]);
        };

        Part.prototype.getLink = function(link, part) {
            return this.firstEndpoint('outgoing', [link, part]);
        };

        Part.prototype.eachLink = function(directions, callback) {
            if(typeof directions === 'function') {
                callback = directions;
                directions = undefined;
            }
            if(typeof directions === 'string') directions = [directions];
            if(!directions) directions = ['outgoing', 'incoming'];

            return this.eachNeighbor(directions, function(neighbor, direction) {
                if(!neighbor.isLink()) return;
                return callback.call(neighbor, neighbor, direction);
            });
        };

        Part.prototype.addLink = function(linkName, node) {
            let self = this;
            if(self.hasLink(linkName, node)) return true;
            node = Part.get(node);
            if(!node) return false;
            let link = Part.create({
                concept: linkName,
                start: self,
                end: node
            });
            self.updatePage();
            link.updatePage();
        };

        Part.prototype.removeLink = function(link, node) {
            let self = this;
            for(let id in self.neighbors.outgoing) {
                let neighbor = self.neighbors.outgoing[id];
                if(neighbor.isLink() && neighbor.matches(link) && neighbor.getEnd().matches(node)) {
                    neighbor.delete();
                    self.updatePage();
                    neighbor.updatePage();
                }
            }
        };

        Part.prototype.updatePage = function(doLayout) {
            let self = this;
            Page.eachExplorer(function(e) {
                self.updateExplorer(e);
            });
        };

        Part.prototype.updateExplorer = function(explorer) {
            let self = this, diagram = explorer.getActiveDiagram();
            if(self.deleted) {
                self.removeGoData(diagram);
            } else {
                if(self.isNode()) {
                    let node = explorer.getNode();
                    if(node && (self === node || self.hasLink('in', node)))
                        self.addGoData(diagram);
                } else if(self.isLink()) {
                    let goStart = self.getStart().getGoData(diagram),
                        goEnd = self.getEnd().getGoData(diagram);
                    if(goStart && goEnd) self.addGoData(diagram);
                    else if(goStart) {
                        if(self.matches('is a')) {
                            let is_a = goStart.is_a;
                            if(!is_a) is_a = {};
                            is_a[self.getEndId()] = self.getEnd();
                            diagram.model.set(goStart, 'is_a', is_a);
                        } else if(self.matches('in') && self.getEnd().matches('predicate')) {
                        }
                    } else if(goEnd) {

                    }
                }
            }
            let goPart = self.getGoPart(diagram);
            if(goPart) goPart.updateTargetBindings();
        };

        Part.prototype.getGoPart = function(diagram) {
            let part = diagram.findPartForKey(this.getId());
            if(!part && this.oldId !== undefined) part = diagram.findPartForKey(this.oldId);
        };

        Part.prototype.addGoData = function(diagram) {
            let self = this, goData = self.getGoData(diagram);
            let data = {
                id: self.getId(),
                name: self.getName(),
                description: self.getDescription()
            }
            if(!(diagram instanceof go.Palette)) data.loc = '0 0';
            if(self.isLink()) {
                data.from = self.getStartId();
                data.to = self.getEndId();
                if(!goData) diagram.model.addLinkData(data);
            } else {
                if(!goData) diagram.model.addNodeData(data);
            }

            if(goData) self.setGoData(diagram, data);
        };

        Part.prototype.getGoData = function(diagram, key) {
            let data = null;
            if(this.isLink()) {
                data = diagram.model.findLinkDataForKey(this.getId());
                if(!data && this.oldId !== undefined)
                    data = diagram.model.findLinkDataForKey(this.oldId);
            } else {
                data = diagram.model.findNodeDataForKey(this.getId());
                if(!data && this.oldId !== undefined)
                    data = diagram.model.findNodeDataForKey(this.oldId);
            }
            if(data && key) return data[key];
            return data;
        };

        Part.prototype.setGoData = function(diagram, key, value) {
            let data = this.getGoData(diagram);
            if(!data) return;
            if(typeof key === 'object') {
                for(let k in key) {
                    diagram.model.set(data, k, key[k]);
                }
            }
            else diagram.model.set(data, key, value);
        };

        Part.prototype.removeGoData = function(diagram) {
            let goData = this.getGoData(diagram);
            if(goData) {
                if(this.isNode()) diagram.model.removeNodeData(data);
                else if(this.isLink()) diagram.model.removeLinkData(data);
            }
        };

        Part.prototype.draw = function(diagram) {
            let self = this;
            if(self.isNode()) {
                self.addGoData(diagram);
            } else if(self.isLink()) {
                let goStart = self.start.getGoData(diagram);
                if(!goStart) return;
                let goEnd = self.end.getGoData(diagram);
                if(goEnd) self.addGoData(diagram);
                else {
                }
            }
        };



























