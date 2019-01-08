        Object.prototype.setIndex = function() {
            let ref = this, n = arguments.length;
            for(let i = 0; i < n-2; i++) {
                let index = arguments[i];
                if(!ref[index]) ref[index] = {};
                ref = ref[index];
            }
            ref[arguments[n-2]] = arguments[n-1];
        };

        Object.prototype.deleteIndex = function() {
            let ref = this, refs = [], n = arguments.length;
            for(let i = 0; i < n-1; i++) {
                let index = arguments[i];
                if(!ref[index]) return;
                refs.push(ref);
                ref = ref[index];
            }
            delete ref[arguments[n-1]];
            while(Object.keys(ref).length === 0) {
                ref = refs.pop();
                delete ref[arguments[--i]];
            }
        };

        function Entry() {
        }

        Entry.prototype.get = function(key) {
            return this[key];
        };

        Entry.prototype.set = function(key, value) {
            this[key] = value;
        };

        Entry.prototype.getId = function() {
            return this.id;
        };

        Entry.prototype.findEntry = function(table, id) {
            if(this.relation) return this.relation.findEntry(table, id);
            return null;
        };

        Entry.prototype.findId = function(table, opts) {
            let entries = this.relation.getTable(table);
            for(let id in entries) {
                let entry = entries[id], match = true;
                for(let key in opts) {
                    if(entry[key] != opts[key]) {
                        match = false;
                        break;
                    }
                }
                if(match) return id;
            }
            return null;
        };

        Entry.prototype.store = function(data) {
            for(let key in data) {
                this.set(key, data[id][key]);
            }
        };

        Entry.prototype.clearIndices = function() {
        };


        function Framework() {
        }

        Framework.prototype = Object.create(Entry.prototype);
        Framework.prototype.constructor = Framework;
        Framework.prototype.table = 'framework';


        function Concept() {
        }

        Concept.prototype = Object.create(Entry.prototype);
        Concept.prototype.constructor = Concept;
        Concept.prototype.table = 'concept';

        Concept.prototype.instanceOf = function(parent) {
            if(typeof parent == 'string') parent = this.findId(this.table, {name: parent});
            if(this.id == parent) return true;
            if(this.dependencies[parent]) return true;
            for(let dep in this.dependencies) {
                let concept = this.findEntry(this.table, dep);
                if(concept.instanceOf(parent)) return true;
            }
            return false;
        };

        Concept.prototype.getAllConcepts = function(obj) {
            let self = this;
            if(!obj) obj = {};
            if(obj.hasOwnProperty(self.id)) return;
            obj[self.id] = self;
            for(let id in this.dependencies) {
                let concept = this.findEntry('concept', id);
                if(concept) concept.getAllConcepts(obj);
            }
            return obj;
        };

        //compile symbols of this concept and all dependencies into one
        Concept.prototype.getCommands = function(type) {
            let self = this, str = self[type], commands = [];
            let concepts = self.getAllConcepts();
            for(let id in concepts) {
                let str = concepts[id][type];
                if(str) commands = commands.concat(str.trim().split("\n"));
            }
            return commands;
        };

        Concept.prototype.getOperationIndex = function() {
            let ops = ['power', ['product', 'ratio'], ['sum', 'difference']];
            for(let i = 0; i < ops.length; i++) {
                if(typeof ops[i] == 'string' && this.name == ops[i]) return i;
                if(typeof ops[i] == 'object' && ops[i].indexOf(this.name) >= 0) return i;
            }
            return -1;
        };


        function Law() {
            this.nodes = [];
            this.sets = {};
        }

        Law.prototype = Object.create(Entry.prototype);
        Law.prototype.constructor = Law;
        Law.prototype.table = 'law';

        Law.prototype.store = function(data) {
            let self = this;
            super.store(data);
        };

        Law.prototype.eachNode = function(callback) {
            let self = this;
            self.nodes.forEach(function(id) {
                let node = self.findEntry('node', id);
                if(!node) return;
                callback.call(node, node);
            });
        };

        Law.prototype.removeNode = function(id) {
            let ind = this.nodes.indexOf(id);
            if(ind >= 0) this.nodes.splice(ind, 1);
        };

        Law.prototype.hasTag = function(tag) {
            return this.hashtags.hasOwnProperty(tag) && this.hashtags[tag];
        }

        Law.prototype.getNodesByConcept = function(concept) {
            let nodes = [], self = this;
            this.nodes.forEach(function(id) {
                let node = self.findEntry('node', id);
                if(!node) return;
                let nodeConcept = node.getConcept();
                if(!nodeConcept) return;
                if((typeof concept == 'number' && nodeConcept.id == concept) || (typeof concept == 'string' && nodeConcept.name == concept))
                    nodes.push(node);
            });
            return nodes;
        };

        Law.prototype.propagateData = function(type) {
            let self = this;
            //determine what nodes each node's data depends on
            self.eachNode(function(node) {
                node.initData(type);
            });
            self.eachNode(function(node) {
                node.setupData(type);
            });
            let count = 0;
            do {
                //find all nodes that have now had their dependencies resolved,
                //and pass their data to their dependents in turn
                count = 0;
                self.eachNode(function(node) {
                    let data = node.data[type];
                    if(data.known) return;
                    if(Object.getOwnPropertyNames(data.waiting).length == 0) {
                        count++;
                        data.known = true;
                        for(let id in data.trigger) {
                            data.trigger[id].resolveDataDependency(type, node);
                        }
                    }
                });
            } while(count > 0);
        };


        function Node() {
            let self = this;
            self.children = {0: {}, 1: {}};
            self.symbol = new Symbol();
            self.value = new Value();
            self.data = {
                'symbol': self.symbol,
                'value': self.value
            }
            self.evaluated = {};
            self.tentative = false;
        }

        Node.prototype = Object.create(Entry.prototype);
        Node.prototype.constructor = Node;
        Node.prototype.table = 'node';

        Node.prototype.set = function(key, value) {
            switch(key) {
                case 'value':
                    this.setValue(value);
                    break;
                case 'head':
                    this.setHead(value);
                    break;
                case 'reference':
                    this.setReference(value);
                    break;
                default:
                    super.set(key, value);
                    break;
            }
        };

        Node.prototype.clearIndices = function() {
            Law.predicateTop.deleteIndex(this.concept, this.id);
            Law.setTop.deleteIndex(this.head, this.reference, this.concept, this.id);
        };

        Node.prototype.updateIndices = function() {
            let self = this;
            //if I have no parents I am a top predicate node
            if(self.isPredicate && self.head == null && self.reference == null) {
                Law.predicateTop.setIndex(self.concept, self.id, true);
            }
            //if I am in a set and my parents aren't in it, I am a top set node
            if(self.isSet) {
                let head = self.getHead(), ref = self.getReference();
                if((!head || !head.isSet || head.setId != self.setId) &&
                   (!ref || !ref.isSet || ref.setId != self.setId))
                   Law.setTop.setIndex(self.head, self.reference, self.concept, self.id, true);
            }
            //if any of my children is in the same predicate/set as me,
            //then I am not a deep node of that predicate/set
            self.predicateDeep = self.isPredicate;
            self.setDeep = self.isSet;
            if(self.predicateDeep || self.setDeep) {
                self.getChildren().every(function(child) {
                    if(predicateDeep && child.isPredicate) predicateDeep = false;
                    if(setDeep && child.isSet && child.setId == self.setId) setDeep = false;
                    return self.predicateDeep || self.setDeep;
                });
            }
        };

        Node.prototype.getConcept = function() {
            return this.findEntry('concept', this.concept);
        };

        Node.prototype.instanceOf = function(concept) {
            return this.getConcept().instanceOf(concept);
        };

        Node.prototype.getValue = function() {
            if(this.value && this.value.values.length == 1)
                return this.value.values[0];
            return null;
        };

        Node.prototype.setValue = function(value) {
            if(value == null) return;
            if(typeof value == 'string') this.value.readValue(value);
            else if(typeof value == 'object') this.value.readValue(value.writeValue());
        }

        Node.prototype.getHead = function() {
            return this.findEntry(this.table, this.head);
        };

        Node.prototype.getReference = function() {
            return this.findEntry(this.table, this.reference);
        };

        Node.prototype.getParents = function() {
            return [this.getHead(), this.getReference()];
        };

        Node.prototype.setHead = function(id) {
            let currentHead = this.findEntry('node', this.head);
            if(currentHead) currentHead.removeChild(0, this.id);
            this.head = id;
            let newHead = this.findEntry('node', this.head);
            if(newHead) newHead.addChild(0, this);
        };

        Node.prototype.setReference = function(id) {
            let currentReference = this.findEntry('node', this.reference);
            if(currentReference) currentReference.removeChild(1, this.id);
            this.reference = id;
            let newReference = this.findEntry('node', this.reference);
            if(newReference) newReference.addChild(1, this);
        };

        //type == 0 for children whose head is me, 1 for children whose reference is me
        Node.prototype.addChild = function(type, node) {
            this.children[type][node.getId()] = node;
        };

        Node.prototype.getChildren = function(type) {
            let children = [], types = null;
            if(type === undefined) types = [0, 1];
            else types = [type];
            types.forEach(function(t) {
                for(let id in this.children[t]) {
                    children.push(this.children[t][id]);
                }
            });
            return children;
        };

        Node.prototype.getChildrenByConcept = function(concept, type) {
            let children = [], types = null;
            if(type === undefined) types = [0];
            else types = [type];
            types.forEach(function(t) {
                for(let id in this.children[t]) {
                    let child = this.children[t][id];
                    if(child.instanceOf(concept)) children.push(child);
                }
            });
            return children;
        };

        Node.prototype.removeChild = function(type, id) {
            delete this.children[type][id];
        };

        Node.prototype.remove = function() {
            this.setHead(null);
            if(this.relation) this.relation.removeEntry('node', this.id);
            let law = this.findEntry('law', this.law);
            if(law) law.removeNode(this.id);
        };

        Node.prototype.isPredicate = function() {
            let law = this.findEntry('law', this.law);
            for(let p in law.predicates) {
                for(let n in law.predicates[p]) {
                    if(n == this.id) return true;
                }
            }
            return false;
        };

        //use string shorthand to find connected nodes, eg. C.C means all my childrens' children
        //or H.R means my head's reference
        Node.prototype.getConnectedNodes = function(str) {
            let chain = str.split('.'), nodes = [this];
            let symmetric = this.getConcept().symmetric;
            chain.forEach(function(name) {
                let arr = [];
                nodes.forEach(function(node) {
                    switch(name[0]) {
                        case 'S': arr.push(node); break;
                        case 'A': arr.push(node.getHead()); break;
                            //if(symmetric) arr.push(node.getReference()); break;
                        case 'B': arr.push(node.getReference()); break;
                            //if(symmetric) arr.push(node.getHead()); break;
                        case 'C': arr = arr.concat(node.getChildren(0)); break;
                        default: break;
                    }
                });
                nodes = arr;
            });
            return nodes;
        };

        Node.prototype.initData = function(type) {
            let self = this, data = self.data[type];
            data.waiting = {};
            data.trigger = {};
            data.blocks = {};
            data.known = false;

            switch(type) {
                case 'symbol':
                    if(self.name) {
                        data.blocks['text'] = [{text: self.name}];
                    }
                    break;
                case 'value':
                    if(self.getValue() !== null) {
                        data.blocks['text'] = [{text: '' + self.getValue()}];
                    }
                    break;
            }
        };

        Node.prototype.setupData = function(type) {
            let self = this, input = null;
            let symmetric = self.getConcept().symmetric;
            let commands = self.getConcept().getCommands(type);
            let variable = "\{\{([^}{]+)\}\}", word = "([^}{]+)";
            commands.forEach(function(command) {
                for(let i = 0; i < (symmetric ? 2 : 1); i++) {
                    let str = command;
                    if(i == 1) {
                        str = str.replace(/\{\{A\}\}/g, "\{\{a\}\}").replace(/\{\{B\}\}/g, "\{\{A\}\}").replace(/\{\{a\}\}/g, "\{\{B\}\}");
                    }

                    let match = str.match(new RegExp("^\\s*(?:" + variable + "\\s*:\\s*)*(.*)"));
                    if(!match || match.length < 3) return;
                    let targetName = match[1] || 'S';

                    switch(type) {
                        case 'symbol': args = match[2].split(' '); break;
                        case 'value': args = [match[2]]; break;
                    }
                    let block = args[0], blockType = args[1] || 'text';

                    let targetContext = targetName[targetName.length-1] == ':';
                    if(targetContext) targetName = targetName.substring(0, targetName.length-1);

                    let targets = self.getConnectedNodes(targetName);
                    targets.forEach(function(target) {
                        let regex = new RegExp("\{\{([^}{])\}\}", 'g'), arr = [], sources = [], text = block;
                        while((arr = regex.exec(block)) !== null) {
                            let source = (targetContext ? target : self).getConnectedNodes(arr[1])[0];
                            if(!source) continue;
                            if(sources.indexOf(source) < 0) sources.push(source);
                            text = text.replace("\{\{" + arr[1] + "\}\}", "\{\{" + source.id + "\}\}");
                        }
                        target.createDataDependency(type, sources, text, blockType);
                    });
                }
            });
        };

        Node.prototype.createDataDependency = function(type, sources, text, blockType) {
            let self = this, data = self.data[type];
            if(!data.blocks.hasOwnProperty(blockType)) data.blocks[blockType] = [];
            if(blockType == 'text' && data.blocks[blockType].length > 0) return;
            data.blocks[blockType].push({text: text});
            let blockId = data.blocks[blockType].length - 1;
            sources.forEach(function(source) {
                let sourceId = source.id;
                if(!data.waiting.hasOwnProperty(sourceId)) data.waiting[sourceId] = {};
                if(!data.waiting[sourceId].hasOwnProperty(blockType)) data.waiting[sourceId][blockType] = {};
                data.waiting[sourceId][blockType][blockId] = true;
                source.data[type].trigger[self.id] = self;
            })
        };

        Node.prototype.resolveDataDependency = function(type, node) {
            let self = this, data = self.data[type];
            for(let blockType in data.waiting[node.id]) {
                for(let blockId in data.waiting[node.id][blockType]) {
                    let block = data.blocks[blockType][blockId], text = node.data[type].toString();
                    if(!text || text == null || text == undefined) text = '';
                    else switch(type) {
                        case 'symbol': {
                            let op = self.getConcept().getOperationIndex(), nodeOp = node.getConcept().getOperationIndex();
                            if(op >= 0 && nodeOp >= 0 && op < nodeOp) {
                                text = '<mfenced>' + text + '</mfenced>';
                            }
                        } break;
                        case 'value':
                            break;
                    }
                    block.text = block.text.replace("\{\{" + node.id + "\}\}", text);
                }
            }
            delete data.waiting[node.id];
            delete node.data[type].trigger[self.id];
        };

        /*
        Determine what nodes in any predicate or set description I match,
        based on my concept and what my parents have already matched
        */
        Node.prototype.updateMatches = function() {
            let self = this, symmetric = self.getConcept().symmetric;
            //first check if I match a top-level node from any set or predicate description
            let concepts = self.getConcept().getAllConcepts();
            let predicates = Law.getIndex('predicate.top'), sets = Law.getIndex('set.top');
            for(let concept in concepts) {
                //for a predicate, matching the concept of a top-level node is enough
                for(let nodeId in predicates[concept]) {
                    self.setMatch(nodeId);
                }
                //for a set, if its top-level node has parents in our relation,
                //my parents must be the same as its parents - if either parent is null, we ignore it
                for(let i = 0; i < 2; i++) for(let j = 0; j < 2; j++) {
                    let h = i == 0 ? null : self.head, r = j == 0 ? null : self.reference;
                    for(let nodeId in sets[h][r][concept]) self.setMatch(nodeId);
                    if(symmetric) for(let nodeId in sets[r][h][concept]) self.setMatch(nodeId);
                }
            }

            //then check existing partial matches on my parents, and add me to them if appropriate
            let candidates = {};
            for(let i = 0; i < 2; i++) {
                let parent = self.getParent(i);
                if(!parent) continue;
                for(let matchId in parent.matches) {
                    let parentMatch = self.findEntry('node', matchId);

                    //if the node my parent matched was already deep, we can't go any deeper
                    if(parentMatch.isDeepPredicate || parentMatch.isDeepSet) continue;

                    //consider both of my orientations if I am symmetric
                    for(let j = 0; j < 2; j++) {
                        if(j == 1 && !symmetric) continue;
                        parentMatch.getChildren((i+j)%2).forEach(function(childMatch) {

                            //first, this node's concept must match that of the child node's concept
                            if(!self.getConcept().instanceOf(childMatch.getConcept())) return;
                            let childId = childMatch.id;
                            if(candidates[childId][j]) return self.setMatch(childId, j);

                            //if the matching node has no other parent anyway, the match is complete
                            let childMatchOtherParent = childMatch.getParent((i+j+1)%2);
                            if(childMatchOtherParent == null) return self.setMatch(childId, j);

                            //to match a set node whose other parent is a normal relation node,
                            //my other parent must be the same relation node
                            if(parentMatch.setId !== null && childMatchOtherParent.setId === null) {
                                let otherParent = self.getParent((i+1)%2);
                                if(otherParent !== childMatchOtherParent) return;
                            }

                            //otherwise, we mark this child as matched pending a match with the other parent
                            if(i == 0) {
                                if(!candidates[child.id]) candidates[child.id] = {};
                                candidates[child.id][j] = true;
                            }
                        });
                    }
                }
            }
        };

        Node.prototype.setMatch = function(nodeId, direction) {
            self.matches[nodeId] = true;
        };


        function Symbol() {
        }

        Symbol.prototype.toString = function() {
            let self = this;
            let types = ['text', 'over', 'sub', 'super', 'arg'];
            types.forEach(function(type) {
                if(!self.blocks.hasOwnProperty(type) || self.blocks[type].length < 1) return;
                let str = '';
                for(let id in self.blocks[type]) {
                    let block = self.blocks[type][id];
                    str += block.text + ',';
                }
                str = str.substring(0, str.length-1);
                str = '<mrow>' + str + '</mrow>';
                switch(type) {
                    case 'text':
                        self.text = str;
                        break;
                    case 'over':
                        self.text = '<mover>' + self.text + str + '</mover>';
                        break;
                    case 'sub':
                        self.text = '<msub>' + self.text + str + '</msub>';
                        break;
                    case 'super':
                        self.text = '<msup>' + self.text + str + '</msup>';
                        break;
                    case 'arg':
                        self.text = '<mrow>' + self.text + '<mfenced>' + str + '</mfenced></mrow>';
                        break;
                    default: break;
                }
            });
            return self.text;
        };



        function Value(str) {
            this.opts = {};
            this.values = [];
            if(typeof str == 'string') this.readValue(str);
        }

        Value.prototype.get = function(key) {
            return this.opts[key];
        }

        Value.prototype.set = function(key, val) {
            this.opts[key] = val;
        };

        Value.prototype.empty = function() {
            return this.values.length == 0;
        };

        Value.prototype.addValue = function(value) {
            if(value == null) return;
            if(typeof value == 'object' && value.empty()) return;
            this.values.push(value);
        };

        Value.prototype.toString = function() {
            let self = this;
            if(!self.blocks || !self.blocks.hasOwnProperty('text')) return '';
            let text = self.blocks['text'][0].text, arr = text.split(/\s+/);
            let ops = ['^', '*', '/', '+', '-'];
            let str = text;
            if(!isNaN(arr[0]) && ops.indexOf(arr[1]) >= 0 && !isNaN(arr[2])) {
                let a = parseFloat(arr[0]), b = parseFloat(arr[2]), c = null;
                switch(arr[1]) {
                    case '^': c = Math.pow(a, b); break;
                    case '*': c = a * b; break;
                    case '/': c = a / b; break;
                    case '+': c = a + b; break;
                    case '-': c = a - b; break;
                }
                if(typeof c === 'number') str = '' + c;
            }
            return str;
        };

        Value.prototype.writeValue = function() {
            let str = '', delimStart = '', delimEnd = '';
            switch(this.get('type')) {
                case 'tuple':
                    delimStart = '{';
                    delimEnd = '}';
                    break;
                case 'interval':
                    delimStart = this.get('include.start') ? '[' : '(';
                    delimEnd = this.get('include.end') ? ']' : ')';
                    break;
                default: break;
            }
            str += delimStart;
            this.values.forEach(function(value) {
                if(typeof value == 'object')
                    str += value.writeValue();
                else str += value;
                str += ',';
            });
            str = str.substring(0, str.length-1) + delimEnd;
            return str;
        };

        Value.prototype.readValue = function(str) {
            str = str || '';
            let self = this, arr = str.split(',');
            self.values = [];
            arr.forEach(function(str) {
                if(str == '') return;
                if(!isNaN(str)) {
                    self.addValue(parseFloat(str));
                } else if(str[0] == '{') {
                    self.readTuple(str);
                } else if(str[0] == '(' || str[0] == '[') {
                    self.readInterval(str);
                } else {
                    self.addValue(str);
                }
            });
        };

        Value.prototype.readTuple = function(str) {
            let value = new Value();
            value.set('type', 'tuple');
            arr = str.substring(1, str.length-1).split(',');
            arr.forEach(function(str, i) {
                value.readValue(str);
            });
            this.addValue(value);
        };

        Value.prototype.readInterval = function(str) {
            let value = new Value();
            value.set('type', 'interval');
            if(str[0] == '(') value.set('include.start', false);
            else if(str[0] == '[') value.set('include.start', true);
            if(str[str.length-1] == ')') value.set('include.end', false);
            else if(str[str.length-1] == ']') value.set('include.end', true);
            arr = str.substring(1, str.length-1).split(',');
            value.readValue(arr[0]);
            value.readValue(arr[1]);
            this.addValue(value);
        };

        Value.prototype.includes = function(value) {
            if(value == null) return false;
            if(this.get('type') == value.get('type')) {
                switch(this.get('type')) {
                    case 'tuple':
                        let match = this.values.length == value.values.length;
                        if(match) for(let i = 0; i < this.values.length; i++) {
                            if(this.values[i] != value.values[i]) match = false;
                        }
                        if(match) return true;
                        break;
                    case 'interval':
                        let myStart = this.values[0], otherStart = value.values[0],
                            myEnd = this.values[1], otherEnd = value.values[1],
                            myIncludeStart = this.get('include.start'), myIncludeEnd = this.get('include.end'),
                            otherIncludeStart = value.get('include.start'), otherIncludeEnd = value.get('include.end');
                        let startIncluded = myStart < otherStart ||
                            (myStart == otherStart && myIncludeStart || !otherIncludeStart);
                        let endIncluded = myEnd > otherEnd ||
                            (myEnd == otherEnd && myIncludeEnd || !otherIncludeEnd);
                        if(startIncluded && endIncluded) return true;
                        break;
                    default: break;
                }
            }
        };

        Value.prototype.intersect = function(value) {
            return new Value();
        };


        Relation.prototype.storeEntries = function(ajaxData) {
            let self = this;
            if(!ajaxData || typeof ajaxData.entries != 'object') return;
            console.log('storing entries');
            console.info(ajaxData.entries);

            //order in which entries should be stored
            let tables = ['concept', 'node', 'law', 'framework'];
            tables.forEach(function(table) {
                let data = ajaxData.entries[table];
                if(!data) continue;
                let entries = self.getTable(table);
                let saved = {};

                //make sure all records are created with the proper IDs
                for(let id in data) {
                    if(isNaN(id)) continue;
                    id = parseInt(id);
                    let oldId = data[id].oldId;
                    if(!entries[id]) {
                        if(oldId && entries[oldId]) {
                            entries[id] = entries[oldId];
                            delete entries[oldId];
                        } else entries[id] = self.createEntry(table);
                    }
                }
                //clear any indices on these records - to be recalculated after
                for(let id in data) {
                    entry.clearIndices();
                }
                //update the data in each record
                for(let id in data) {
                    let entry = entries[id];
                    entry.store(data[id]);
                    saved[id] = true;
                }

                //post-process each record as needed
                let frameworkReset = false;
                for(let id in saved) {
                    let entry = entries[id], oldId = data[id].oldId;
                    entry.updateIndices();
                    switch(table) {
                        case 'framework':
                            if(self.framework.id == id || self.framework.id == oldId) {
                                self.setFramework(entry);
                                frameworkReset = true;
                            }
                            break;
                        case 'law':
                            //update hash tags
                            let hashtags = entry.hashtags;
                            entry.hashtags = {};
                            if(hashtags) hashtags.split(',').forEach(function(tag) {
                                entry.hashtags[tag] = true;
                            });
                            //update which nodes are deep nodes of this law
                            entry.deepNodes = [];
                            entry.eachNode(function(node) {
                                if(node.isDeep) entry.deepNodes.push(node.id);
                            });
                            //update predicate groups
                            entry.predicateSets = [];
                            if(self.law.id == entry.id || self.law.id == oldId) {
                                self.setLaw(entry);
                            }
                            $.each(entry.predicates, function(id, group) {
                                let pset = [];
                                for(let node in group) {
                                    pset.push(parseInt(node));
                                }
                                entry.predicateSets.push(pset);
                            });
                            break;
                        case 'concept':
                            let graphs = [self.palette, self.diagram];
                            for(let i = 0; i < graphs.length; i++) {
                                let graph = graphs[i], found = false;
                                graph.nodes.each(function(node) {
                                    if(node.data.concept == id) {
                                        found = true;
                                        graph.model.set(node.data, 'concept', id);
                                        graph.model.set(node.data, 'framework', data[id].framework);
                                        graph.model.updateTargetBindings(node.data, 'concept');
                                    }
                                });
                                if(graph === self.palette && !found) {
                                    graph.model.addNodeData({
                                        concept: id,
                                        framework: data[id].framework,
                                        visible: self.isVisibleInPalette(id)
                                    });
                                }
                            }
                            break;
                        case 'node':
                            let nodeData = self.diagram.model.findNodeDataForKey(id);
                            if(!nodeData && oldId) nodeData = self.diagram.model.findNodeDataForKey(oldId);
                            if(nodeData) {
                                for(let key in entry)
                                    if(nodeData.hasOwnProperty(key))
                                        self.diagram.model.set(nodeData, key, entry[key]);
                                self.diagram.model.updateTargetBindings(nodeData);
                            }
                            break;
                        default: break;
                    }
                }
            });
            if(frameworkReset) self.filterPalette();
        };


        Relation.prototype.createEntry = function(table, data) {
            let self = this, entry = null;
            switch(table) {
                case 'framework': entry = new Framework(); break;
                case 'law': entry = new Law(); break;
                case 'concept': entry = new Concept(); break;
                case 'node': entry = new Node(); break;
                default: break;
            }
            if(entry) {
                entry.relation = self;
                if(typeof data == 'object') {
                    for(let key in data) entry.set(key, data[key]);
                }
            }
            return entry;
        };


        Relation.prototype.findEntry = function(table, id) {
            let self = this, entries = self.getTable(table);
            if(entries && entries.hasOwnProperty(id)) return entries[id];
            return null;
        };


        Relation.prototype.removeEntry = function(table, id) {
            let self = this, entries = self.getTable(table);
            if(entries && entries.hasOwnProperty(id)) delete entries[id];
            switch(table) {
                case 'framework': break;
                case 'concept': break;
                case 'law': break;
                case 'node':
                    let graphNode = self.diagram.findNodeForKey(id);
                    if(graphNode) {
                        let links = graphNode.findLinksConnected(), linkData = [];
                        while(links.next())
                            linkData.push(links.value.data);
                        linkData.forEach(function(data) {
                            self.diagram.model.removeLinkData(data);
                        });
                        self.diagram.model.removeNodeData(graphNode.data);
                    }
                    break;
            }
        };


        Relation.prototype.getTable = function(name) {
            let self = this;
            switch(name) {
                case 'concept': return self.concepts; break;
                case 'framework': return self.frameworks; break;
                case 'node': return self.nodes; break;
                case 'law': return self.laws; break;
                default: break;
            }
            return null;
        };
