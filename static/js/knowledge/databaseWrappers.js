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

            toArray: function(obj) {
                arr = [];
                for(let key in obj) {
                    arr.push(obj[key]);
                }
                return arr;
            },

            each: function(obj, callback) {
                if(Object.keys(obj).length === 0) return true;
                let ret = true;
                $.each(obj, function(key, val) {
                    if(callback.call(val, val, key) === false) {
                        ret = false;
                        return false;
                    }
                });
                return ret;
            },

            hasIndex: function() {
                let args = Misc.cleanArguments(arguments), n = args.length, i = 1, ref = args[0];
                while(typeof ref === 'object' && i < n) {
                    ref = ref[args[i++]];
                }
                return i === n && ref !== undefined ? true : false;
            },

            getIndex: function() {
                let args = Misc.cleanArguments(arguments), n = args.length, ref = args[0];
                for(let i = 1; i < n; i++) {
                    let index = args[i];
                    if(index === undefined) continue;
                    if(typeof ref !== 'object'
                        || !ref.hasOwnProperty(index)) return undefined;
                    ref = ref[index];
                }
                return ref;
            },

            getOrCreateIndex: function() {
                let args = Misc.cleanArguments(arguments), n = args.length, ref = args[0];
                for(let i = 1; i < n; i++) {
                    let index = args[i];
                    if(index === undefined) continue;
                    if(!ref[index]) ref[index] = {};
                    ref = ref[index];
                }
                return ref;
            },

            setIndex: function(obj) {
                let args = Misc.cleanArguments(arguments), n = args.length, ref = args[0];
                for(let i = 1; i < n-2; i++) {
                    let index = args[i];
                    if(index === undefined) continue;
                    if(!ref[index]) ref[index] = {};
                    ref = ref[index];
                }
                ref[args[n-2]] = args[n-1];
            },

            deleteIndex: function(obj) {
                let args = Misc.cleanArguments(arguments), n = args.length, ref = args[0], i = 1, refs = [];
                for(; i < n-1; i++) {
                    let index = args[i];
                    if(index === undefined) continue;
                    if(!ref[index]) return;
                    refs.push(ref);
                    ref = ref[index];
                }
                if(ref) delete ref[args[i--]];
                while(ref && Object.keys(ref).length === 0) {
                    ref = refs.pop();
                    if(ref) delete ref[args[i--]];
                }
            },

            cleanArguments: function(args, clean) {
                if(!clean) clean = [];
                for(let i = 0; i < args.length; i++) {
                    if(args[i] === undefined) clean.push('');
                    else if(Array.isArray(args[i])) {
                        Misc.cleanArguments(args[i], clean);
                    } else clean.push(args[i]);
                }
                return clean;
            }

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
                        else table.delete(id);
                    } else {
                        if(record instanceof Concept) {
                            records.concept[id] = {
                                name: record.name || '',
                                description: record.description || '',
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
                }, true);
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
            Part.updateReferences();
            Concept.table.removeOldIds();
            Part.table.removeOldIds();
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
                let goPart = data.part ? data.part : data;
                if((goPart instanceof go.Node || goPart instanceof go.Link) && goPart.data) {
                    let id = goPart.data.id, part = null;
                    if(goPart.data.category === 'LinkLabel') {
                        if(typeof id !== 'string') id = null;
                        else id = id.split('-')[0];
                    }
                    if(id) part = Part.table.records[id] || null;
                    if(part) {
                        if(this.type === Part) record = part;
                        else if(this.type === Concept) record = part.getConcept();
                    }
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
            id = parseInt(id);
            record.id = parseInt(record.id);

            if(records.stored[id]) return;
            records.stored[id] = true;

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
            }
        };

        Table.prototype.removeOldIds = function() {
            this.each(function(record) {
                delete record.oldId;
            });
        };

        Table.prototype.each = function(callback, includeDeleted) {
            for(let id in this.records) {
                if(!includeDeleted && this.records[id].deleted) continue;
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

        Table.prototype.delete = function(id) {
            delete this.records[id];
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
            let self = this, links = {};
            Part.table.each(function(part, p) {
                if(part.isLink() && part.getConcept() === self) links[p] = part;
            });
            return links;
        };

        Concept.prototype.getParts = function() {
            let self = this, parts = {};
            Part.table.each(function(part, p) {
                if(part.getConcept() === self) parts[p] = part;
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

        Concept.prototype.toString = function(display) {
            return this.name + (display ? '' : ' (' + this.id + ')');
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

        Part.updateReferences = function() {
            Part.table.each(function(part) {
                let updates = {incoming: {}, outgoing: {}};
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
                if(this.start) this.setNeighbor(this.start, 'incoming');
                if(this.end) this.setNeighbor(this.end, 'outgoing')
            }
        };

        Part.prototype.delete = function() {
            let self = this;
            if(self.deleted) return;
            Record.prototype.delete.call(self);
            self.eachLink(function(link) {
                link.delete();
            });
            if(self.isLink()) {
                if(self.start) {
                    let hadInLink = self.start.isNode() && self.start.hasLink(Concept.in, '*');
                    self.start.setNeighbor(self, 'outgoing', false);
                    if(hadInLink && !self.start.hasLink(Concept.in, '*')) self.start.delete();
                }
                if(self.end) self.end.setNeighbor(self, 'incoming', false);
            }
            if(self.concept && Object.keys(self.concept.getParts()).length === 0) {
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
            if(!isNaN(data)) return this.id == data;
            if(data instanceof Part) return this === data;
            if(data instanceof Concept) return this.concept === data;
            if(typeof data === 'string') {
                if(this.getName() === data) return true;
                let concept = Concept.get(data), node = null;
                if(concept) node = concept.getNode();
                if(node) return this.hasLink(Concept.isA, node);
            }
            return false;
        };

        Part.prototype.isNode = function() {
            return !this.start && !this.end;
        };
        Part.prototype.isLink = function() {
            return this.start || this.end ? true : false;
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
        Part.prototype.eachEndpoint = function(callback) {
            if(this.start) callback.call(this.start, this.start, 'incoming', this.end);
            if(this.end) callback.call(this.end, this.end, 'outgoing', this.start);
        };

        Part.prototype.isIn = function(part) {
            return this.hasLink(Concept.in, part);
        };

        Part.prototype.isMeta = function() {
            return this.getName() === 'META' || this.has(['>',Concept.in,'>META']) || this.has(['>',Concept.isA,'*',Concept.in,'META']);
        };

        Part.prototype.isGeneral = function() {
            let self = this;
            if(self.isNode()) {
                return !self.each('>in>*', function(context) {
                    return context.has('>is a>*>in>META');
                });
            } else if(self.isLink()) {
                return self.getStart && self.getStart().isGeneral()
                    && self.getEnd() && self.getEnd().isGeneral();
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

        Part.parseChain = function(chain) {
            if(!Array.isArray(chain)) chain = [chain];
            let ret = [], re = new RegExp(/[<|>]/g), match = null;
            chain.forEach(function(data) {
                if(typeof data === 'string') {
                    let ind = 0;
                    while((match = re.exec(data)) !== null) {
                        if(match.index > ind)
                            ret.push(data.substring(ind, match.index));
                        ret.push(data[match.index]);
                        ind = match.index+1;
                    }
                    if(ind < data.length) ret.push(data.substring(ind));
                } else {
                    ret.push(data);
                }
            });
            return ret;
        };

        Part.getDirection = function(str, opposite) {
            if(typeof str !== 'string') return null;
            str = str.toLowerCase();
            switch(str) {
                case '>':
                case 'outgoing':
                    return opposite ? 'incoming' : 'outgoing';
                    break;
                case '<':
                case 'incoming':
                    return opposite ? 'outgoing' : 'incoming';
                    break;
            }
            return undefined;
        };
        Part.getOppositeDirection = function(str) {
            return Part.getDirection(str, true);
        };

        Part.prototype.has = function(chain, index, direction) {

            let self = this;
            chain = Part.parseChain(chain);
            if(index === undefined) index = 0;

            let dir = null, data = null;
            while(index < chain.length && (dir = Part.getDirection(data = chain[index]))) {
                direction = dir;
                index++;
            }
            if(index >= chain.length) return true;

            if(data === null) {
                return direction && self.getEndpoint(Part.opposite(direction)) && self.getEndpoint(direction) === null;
            }

            return !self.eachNeighbor(direction, function(neighbor) {
                return !(neighbor.matches(data) && neighbor.has(chain, index+1, direction));
            })
        };

        Part.prototype.getFirst = function(chain) {
            let endpoints = this.getAll(chain), keys = Object.keys(endpoints);
            if(keys.length === 0) return null;
            return endpoints[keys[0]];
        };

        Part.prototype.getAll = function(chain) {
            chain = Part.parseChain(chain);
            let self = this, parts = {}, neighbors = {}, direction = undefined;
            parts[self.id] = self;
            chain.forEach(function(data) {
                if(dir = Part.getDirection(data)) {
                    direction = dir;
                    return;
                }
                $.each(parts, function(p, part) {
                    if(data === null) {
                        if(direction && part.getEndpoint(Part.opposite(direction)) && part.getEndpoint(direction) === null) {
                            neighbors[p] = part;
                        }
                    } else {
                        part.eachNeighbor(direction, function(neighbor) {
                            if(neighbor.matches(data)) {
                                neighbors[neighbor.getId()] = neighbor;
                            }
                        });
                    }
                });
                parts = neighbors;
                if(data === null) return false;
                neighbors = {};
            });
            return parts;
        };

        Part.prototype.each = function(chain, callback) {
            let parts = this.getAll(chain);
            return Misc.each(parts, callback);
        };

        Part.prototype.printEach = function(chain) {
            let parts = this.getAll(chain);
            return Misc.each(parts, function(part) { console.log(part.toString()); });
        };

        Part.prototype.getMainLinkType = function() {
            return this.isMeta() ? Concept.metaOf : Concept.in;
        };

        Part.prototype.hasLink = function(link, part, recursive) {
            let self = this, hasLink = self.has(['>', link, part]);
            if(hasLink || !recursive) return hasLink;
            return !self.each(['>', link, '*'], function(node) {
                return !node.hasLink(link, part, true);
            });
        };

        Part.prototype.getLink = function(link, part) {
            let self = this, ret = null;
            self.eachLink('outgoing', function(l) {
                if(l.matches(link) && ((part && l.getEnd() && l.getEnd().matches(part)) ||
                    (part === null && l.getEnd() === null)))
                {
                    ret = l;
                    return false;
                }
            });
            return ret;
        };

        Part.prototype.eachLink = function(directions, callback) {
            let self = this;
            if(typeof directions === 'function') {
                callback = directions;
                directions = undefined;
            }
            if(typeof directions === 'string') directions = [directions];
            if(!directions) directions = ['outgoing', 'incoming'];

            return this.eachNeighbor(directions, function(neighbor, direction) {
                if(!neighbor.isLink() || neighbor === self.start || neighbor === self.end) return;
                return callback.call(neighbor, neighbor, direction, neighbor.getEndpoint(direction));
            });
        };

        Part.prototype.eachInLink = function(callback) {
            return this.eachLink('incoming', callback);
        };

        Part.prototype.eachOutLink = function(callback) {
            return this.eachLink('outgoing', callback);
        };

        Part.prototype.eachIsA = function(callback, recursive, checked) {
            let self = this;
            if(recursive && !checked) checked = {};
            return self.each(['>', Concept.isA, '*'], function(node) {
                callback.call(node, node, node.getId());
                if(recursive && !checked[node.getId()] &&
                    node.eachIsA(callback, true, checked) === false) return false;
            });
        };

        Part.prototype.printLinks = function() {
            let self = this, str = '';
            self.eachLink(function(link, direction) {
                str += link.toString() + "\n";
            });
            return str;
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
        };

        Part.prototype.removeLink = function(link, node) {
            let self = this;
            for(let id in self.neighbors.outgoing) {
                let neighbor = self.neighbors.outgoing[id];
                if(neighbor.isLink() && neighbor.matches(link) && (
                    (node && neighbor.getEnd() && neighbor.getEnd().matches(node)) ||
                    (node === null && neighbor.getEnd() === null)))
                {
                    neighbor.delete();
                    neighbor.updatePage();
                }
            }
        };

        Part.prototype.updatePage = function(doLayout) {
            let self = this;
            Page.eachExplorer(function(explorer) {
                if(self.oldId !== undefined) explorer.updatePartId(self);
                if(self.isLink()) explorer.checkLink(self, true);
                else if(self.isNode()) {
                    self.eachLink(function(link) {
                        explorer.checkLink(link);
                    });
                    explorer.updateShown();
                }
            });
        };

        Part.prototype.showIsA = function(diagram, node, show) {
            let goData = this.getGoData(diagram);
            if(!goData) return;
            let isA = goData.isA || {};
            if(show) isA[node.getId()] = node;
            else delete isA[node.getId()];
            diagram.model.set(goData, 'isA', isA);
            let goPart = this.getGoPart(diagram);
            if(goPart) goPart.updateTargetBindings();
        };

        Part.prototype.getGoPart = function(diagram) {
            let part = diagram.findPartForKey(this.getId());
            if(!part && this.oldId !== undefined) part = diagram.findPartForKey(this.oldId);
            return part;
        };

        Part.prototype.updateGoData = function(diagram, show) {
            let self = this, model = diagram.model, goData = self.getGoData(diagram), fcn = null,
                updateLinkLabel = false;
            let map = Page.displayedMap, match = map ? map.getMatch(self) : null;
            if(show) {
                let data = {
                    id: self.getId(),
                    name: self.getName(),
                    isMeta: self.isMeta(),
                    mappedId: match ? match.getId() : null
                };
                if(self.isLink()) {
                    if(!self.start || !self.end) return;
                    data.from = self.start.getGoNodeId();
                    data.to = self.end.getGoNodeId();
                    updateLinkLabel = !goData || !goData.labelKeys || goData.labelKeys[0] != self.getGoNodeId();
                }
                if(!goData) {
                    if(!(diagram instanceof go.Palette)) data.loc = '0 0';
                    fcn = self.isNode() ? model.addNodeData : model.addLinkData;
                    fcn.call(model, data);
                    goData = self.getGoData(diagram);
                } else {
                    for(let key in data) model.set(goData, key, data[key]);
                }
                if(updateLinkLabel) {
                    let goLink = self.getGoPart(diagram), it = null;
                    if(goLink) it = goLink.labelNodes;
                    if(it) while(it.next()) {
                        model.removeNodeData(it.value.data);
                    }
                    model.setLabelKeysForLinkData(goData, [self.getGoNodeId()]);
                    model.addNodeData({
                        id: self.getGoNodeId(),
                        category: 'LinkLabel'
                    });
                }
            } else {
                if(this.isLink()) {
                    let labelData = model.findNodeDataForKey(self.getGoNodeId());
                    if(labelData) model.removeNodeData(labelData);
                }
                if(goData) {
                    fcn = this.isNode() ? model.removeNodeData : model.removeLinkData;
                    fcn.call(model, goData);
                }
            }
        };

        Part.prototype.getGoNodeId = function() {
            if(this.isNode()) return this.getId();
            else if(this.isLink()) return '' + this.getId() + '-label';
            return null;
        };

        Part.prototype.hasGoData = function(diagram) {
            return this.getGoData(diagram) ? true : false;
        };

        Part.prototype.getGoData = function(diagram, key) {
            let data = null, model = diagram.model,
                fcn = this.isNode() ? model.findNodeDataForKey : model.findLinkDataForKey;
            data = fcn.call(model, this.getId());
            if(!data && this.oldId !== undefined)
                data = fcn.call(model, this.oldId);
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
                if(this.isNode()) diagram.model.removeNodeData(goData);
                else if(this.isLink()) diagram.model.removeLinkData(goData);
            }
        };

        Part.prototype.print = function() {
            console.log(this.toString());
        };

        Part.prototype.toString = function(display) {
            let selfStr = '';
            if(this.concept.getName()) {
                selfStr = this.concept.toString(display);
            } else {
                let parent = this.getFirst(['>', Concept.isA, '*']);
                if(parent) selfStr = '(' + parent.getConcept().toString(display) + ')';
            };
            selfStr += display ? '' :  ' [' + this.id + ']';
            if(this.isNode()) {
                return selfStr;
            } else if(this.isLink()) {
                return (this.start ? this.start.toString(display) : 'null')
                    + ' > ' + selfStr + ' > '
                    + (this.end ? this.end.toString() : 'null');
            }
        };

        Part.prototype.displayString = function() {
            return this.toString(true);
        };


























