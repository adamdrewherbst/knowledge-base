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



        /*
            Entry: the generic wrapper class from which all four table-specific wrapper classes inherit.
            Each instance of this class corresponds to one database record.
        */
        function Entry() {
            this.eventHandlers = {};
        }

        // get the value of a specified field in this record
        Entry.prototype.get = function(key) {
            return this[key];
        };

        // set the value of a specified field in this record
        Entry.prototype.set = function(key, value) {
            this[key] = value;
        };

        // get the ID of this record
        Entry.prototype.getId = function() {
            return this.id;
        };

        // ask the global relation object to find the specified record from the given table
        Entry.prototype.findEntry = function(table, data) {
            if(this.relation) return this.relation.findEntry(table, data);
            return null;
        };

        // ask the global relation object to find the ID of the record with the given data
        Entry.prototype.findId = function(table, data) {
            if(this.relation) return this.relation.findId(table, data);
            return null;
        };

        // store the given data fields (probably passed from the server) in this record
        Entry.prototype.store = function(data) {
            for(let key in data) {
                this.set(key, data[key]);
            }
        };

        // defined individually for each wrapper class - to be called before storing the record from the server
        Entry.prototype.preprocess = function() {
        };

        // defined individually for each wrapper class - to be called after storing the record from the server
        Entry.prototype.postprocess = function() {
        };

        // add a callback to this record for the given 'event' string, to be called anytime that event is fired by other code
        Entry.prototype.on = function(event, handler) {
            if(!this.eventHandlers[event]) this.eventHandlers[event] = [];
            this.eventHandlers[event].push(handler);
        };

        // fire the specified event string, with the given data.
        Entry.prototype.trigger = function(event, data) {
            let self = this;
            if(!self.eventHandlers[event]) return;
            self.eventHandlers[event].forEach(function(handler) {
                if(typeof handler === 'function') handler.call(self, data);
            });
        };


        /*
            wrapper class for the 'framework' table in the database.
            Doesn't currently need any functionality other than the basic functions provided by the Entry prototype,
            but functions could be added to it as needed.
        */
        function Framework() {
            Entry.prototype.constructor.call(this);
        }

        Framework.prototype = Object.create(Entry.prototype);
        Framework.prototype.constructor = Framework;
        Framework.prototype.table = 'framework';


        /*
            wrapper class for the 'concept' table in the database.
        */
        function Concept() {
            Entry.prototype.constructor.call(this);
        }

        Concept.prototype = Object.create(Entry.prototype);
        Concept.prototype.constructor = Concept;
        Concept.prototype.table = 'concept';
        Concept.prototype.wildcardConcept = 2;

        // convert a concept's data commands from the database storage format to an array of separate commands
        Concept.prototype.postprocess = function() {
            this.commands = (this.commands || '').split('<DELIM>').map(s => s.trim());
        };

        // check if this concept is an instance of that given by 'parent'
        Concept.prototype.instanceOf = function(parent) {
            let self = this;
            // if parent wasn't given as an ID, retrieve its ID
            if(typeof parent == 'string') parent = self.findId(self.table, parent);
            else if(parent instanceof Concept) parent = parent.id;

            // every concept is an instance of the wildcard concept
            if(parent === self.wildcardConcept) return true;

            // a concept is an instance of itself
            if(self.id == parent) return true;

            // see if this concept is marked as an instance of the parent
            if(self.dependencies[parent]) return true;

            // otherwise check recursively on each of my parent concepts
            for(let dep in self.dependencies) {
                let concept = self.findEntry(self.table, dep);
                if(concept.instanceOf(parent)) return true;
            }
            return false;
        };

        // get an array of all concepts of which this one is an instance
        Concept.prototype.getAllConcepts = function(obj) {
            let self = this;

            if(!obj) obj = {}; // to store all concepts of which I am an instance
            if(obj.hasOwnProperty(self.id)) return; // this concept has already been checked via the recursion below
            obj[self.id] = self; // I am an instance of myself

            // recursively add each parent concept to the list
            for(let id in this.dependencies) {
                let concept = this.findEntry('concept', id);
                if(concept) concept.getAllConcepts(obj); // pass the existing list to the parent to be edited
            }
            return obj;
        };

        // get the list of my data commands
        Concept.prototype.getCommands = function() {
            return this.commands;
        };

        // get the data commands of me and all my dependencies in one array
        // (when a node executes its data commands, it executes those of all concepts of which it is an instance)
        // used in nodeData.js
        Concept.prototype.getAllCommands = function() {
            let self = this, commands = [];
            let concepts = self.getAllConcepts();
            for(let id in concepts) {
                commands.push.apply(commands, concepts[id].getCommands());
            }
            return commands;
        };

        // check if this is the wildcard concept
        Concept.prototype.isWildcard = function() {
            return this.framework === null && this.name === 'anything';
        };


        /*
            wrapper class for the 'law' database table.
        */
        function Law() {
            Entry.prototype.constructor.call(this);
            this.nodes = [];
            this.evaluateQueue = [];
            this.maps = {};
            this.nextMapId = 0;
        }

        Law.prototype = Object.create(Entry.prototype);
        Law.prototype.constructor = Law;
        Law.prototype.table = 'law';

        /*
            predicateTop: an object that indexes all nodes that are the top node in a law predicate
            (ie. they are not the child of any node).  For example, Newton's 2nd Law is predicated on a body
            which has a net force, mass, and acceleration - but these last 3 are child nodes of the body node,
            so only the body node is a predicate top.  The index is on the concept ID followed by the node ID:

                Law.predicateTop[{concept id}][{node id}] = true

            This is used when matching a node in a problem description tree to possible predicates in the
            'updateMatches' function of the Node predicate below.
        */
        Law.predicateTop = {};

        /*
            postprocess: overrides Entry.postprocess
            Performed when a law record sent by the server is stored via the 'storeEntries' function below
        */
        Law.prototype.postprocess = function() {
            let self = this;
            // the hashtags of a law are stored as a comma-separated string in the database; convert that
            // to an object with each hashtag as an index
            let hashtags = self.hashtags;
            self.hashtags = {};
            if(hashtags) hashtags.split(',').forEach(function(tag) {
                if(tag) self.hashtags[tag] = true;
            });

            // figure out which nodes are deep nodes of this law (ie. have no child nodes)
            self.calculateDeepNodes();

            // the server gives us an index of which node is in which predicate set
            // convert this to an array of arrays where each inner array is a single predicate set as a list of node IDs
            self.predicateSets = [];
            self.deepPredicates = {};
            $.each(self.predicates, function(id, group) {
                let pset = [];
                for(let node in group) {
                    pset.push(parseInt(node));
                    // the nodes that are stored as predicate nodes in the database are in fact the deep predicate nodes
                    self.deepPredicates[parseInt(node)] = true;
                }
                self.predicateSets.push(pset);
            });
            // mark each deep predicate node as such, and mark all its ancestors as predicate nodes (but not deep)
            for(let id in self.deepPredicates) {
                let node = self.findEntry('node', id);
                if(node) node.setDeepPredicate();
            }
        };

        // figure out which nodes of this law are 'deep' (have no children)
        Law.prototype.calculateDeepNodes = function() {
            let self = this;
            self.deepNodes = [];

            // loop through all my nodes
            self.nodes.forEach(function(id) {
                let node = self.findEntry('node', id);
                let children = node.getChildren();

                // if I am a non-tentative node and I have at least one non-tentative child node, I am not a deep node
                // (tentative nodes are knowledge that the algorithm has found could be appended to the description tree based on a law,
                // but the user has not chosen to append them yet - see evaluate.js)
                node.isDeep = !node.tentative;
                // start by assuming I am deep, and check if I have a non-tentative child, in which case I am not deep
                if(node.isDeep) children.every(function(child) { // Array.every will loop through elements until one of them returns false
                    if(!child.tentative) {
                        node.isDeep = false;
                        return false;
                    }
                    return true;
                })
                if(node.isDeep) self.deepNodes.push(id);
            });
        };

        // add a node to this law given a 'data' object containing field-value pairs
        Law.prototype.addNode = function(data) {
            let self = this, relation = self.relation;

            // if a node is 'relative to nothing', ie. absolute (such as mass), we say it is in fact relative to the universe (ROOT)
            if(!data.reference) {
                // find the root node that the node is under and set that as the reference
                let head = self.findEntry('node', data.head), root = null;
                if(head) root = head.getRoot();
                if(root) data.reference = root.id;
            }
            let node = relation.createEntry('node', data, true); //defined below
            self.nodes.push(node.getId());

            // if this node is being appended (not waiting for the user to accept it), it needs to be evaluated so we know what predicates it might match
            if(!node.tentative) node.addToEvaluateQueue();
            return node;
        };

        // loops through the nodes of the law and calls the given callback function on each one
        Law.prototype.eachNode = function(callback) {
            let self = this;
            self.nodes.forEach(function(id) {
                let node = self.findEntry('node', id);
                if(!node) return;
                callback.call(node, node); // JS 'call' method - first argument is the 'this' object when inside the function, succeeding arguments are passed to the function
            });
        };

        // removes the given node from the law, but doesn't delete the node - that is handled in Node.prototype.remove
        Law.prototype.removeNode = function(id) {
            let ind = this.nodes.indexOf(id);
            if(ind >= 0) this.nodes.splice(ind, 1);
        };

        // check if the law has a given hash tag
        Law.prototype.hasTag = function(tag) {
            return this.hashtags.hasOwnProperty(tag) && this.hashtags[tag];
        }

        // get all nodes within this law that are an instance of the given concept (which may be given as an ID or name)
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

        // execute the data commands of each node, in the context of other nodes - see nodeData.js for explanation of node data & commands
        Law.prototype.resolveData = function(type) {
            let self = this;
            Dependency.setPropagating(type);
            /*self.eachNode(function(node) {
                node.resetCommands();
            });*/
            self.eachNode(function(node) {
                // set the data of each node to its default values
                node.initData(); // defined in nodeData.js
            });
            self.eachNode(function(node) {
                // parse the node's commands
                node.compileCommands(); // defined in nodeData.js
            });
            self.eachNode(function(node) {
                // flag the node's data of the specified type as active, so that it will propagate to other nodes
                node.getData().activate(type); // defined in nodeData.js
            });
            // pass all data that is already resolved (not waiting on other nodes' data) to the nodes that are waiting on it
            Dependency.propagateValues(); //defined in nodeData.js
            self.eachNode(function(node) {
                // have each node check to see there is any data it is waiting on that is now resolved
                node.checkCommands(); // defined in nodeData.js
            });
        };

        // run the specified callback function on every data command of every node in this law
        Law.prototype.eachCommand = function(callback) {
            let self = this;
            self.eachNode(function(node) {
                for(let cid in node.commands) {
                    callback.call(self, node.commands[cid]);
                }
            });
        };

        /*
            evaluate: used for laws that represent a problem description.
            Go through the whole description tree and see which other laws it matches.  Append their knowledge to the law.
            If the 'tentative' flag is set in relation.options.evaluate, appended nodes will be marked as tentative,
            and they will not be evaluated further - so only the existing description will be checked.  After the user
            chooses to append a particular piece of tentative knowledge, it will then be checked for further matches.
        */
        Law.prototype.evaluate = function() {
            let self = this, opts = self.relation.options.evaluate;
            self.eachNode(function(node) {
                node.initData('concept');
            });
            self.evaluateQueue = [];

            // add each deep node to the queue to be evaluated - it will add its parents to the queue before itself,
            // so that nodes are checked from the top down, which allows us to identify full predicate matches - see Node.prototype.updateMatches
            self.deepNodes.forEach(function(id) {
                let node = self.findEntry('node', id);
                if(node) node.addToEvaluateQueue();
            });
            // as knowledge in the law is updated, nodes could be re-added to the evaluation queue for further checking.  So we just go
            // until the queue is completely empty
            while(self.evaluateQueue.length > 0) {
                let node = self.evaluateQueue.shift();
                node.updateMatches(); // defined below in the Node.prototype
            }
            // may specify a type of data to be auto-resolved once evaluation is complete - for example, to visualize in the drawing canvas,
            // set relation.options.evaluate.propagate = 'visual'
            if(opts.propagate) {
                for(let type in opts.propagate) self.resolveData(type);
            }
        };

        // see if the given node is in the queue to be evaluated
        Law.prototype.inEvaluateQueue = function(node) {
            return this.evaluateQueue.indexOf(node) >= 0;
        }

        // add the given node to the evaluate queue
        Law.prototype.addToEvaluateQueue = function(node) {
            if(!node.tentative) this.evaluateQueue.push(node);
        };

        // add a map to this law's list of maps
        // a map is a matching between the predicate of a law, and a part of the description tree of this law
        // for the Map.prototype definition and further explanation see evaluate.js

        Law.prototype.addMap = function(map) {
            map.id = this.nextMapId;
            this.maps[this.nextMapId++] = map;
        };

        // given a node from this law's description tree, and a deep predicate node of another law, where
        // the ancestors of the node in this law fully match those of the predicate node in the other law,
        // create a Map object to store the mapping between those two ancestor trees
        // - for more on Maps, see evaluate.js

        Law.prototype.addMapFromNodes = function(node, predicate) {

            //create the Map object
            let map = new Map(this); // defined in evaluate.js

            //the Map's 'law' is the one whose predicate we match
            map.predicateLaw = this.findEntry('law', predicate.law);

            if(!map.addNode(node, predicate)) return false; // defined in evaluate.js - recursively adds the ancestor tree mapping to the Map object

            // this map so far only matches one deep predicate node - it can later be merged with other maps to match 2 and more,
            // until it finally matches a predicate set that satisfies the law - then the law's knowledge can be appended to this one
            map.deepPredicates = [predicate.id];

            this.addMap(map);
            // see if the matching law has a predicate set consisting only of the matching predicate node - in that case we've already satisfied the law
            map.satisfied = !map.predicateLaw.predicateSets.every(function(pset) {
                return !(pset.length === 1 && pset[0] == map.deepPredicates[0]);
            });
            // and we can therefore append the law's knowledge to this law's tree
            if(map.satisfied) map.append();

            // otherwise we see if this map can be merged with any others, as noted above
            else map.checkIntersections();
            return true;
        };


        /*
            reset: set the law back to its state before any evaluation happened.  All tentative
            and appended nodes are removed, maps are deleted, and node data is reset to its initial state.
        */
        Law.prototype.reset = function() {
            let self = this;

            // delete all maps
            for(let m in self.maps)
                delete self.maps[m];
            self.nextMapId = 0;

            // empty the evaluation queue
            self.evaluateQueue = [];

            // remove all nodes that have been appended, tentative or not
            for(let i = 0; i < self.nodes.length; i++) {
                let node = self.findEntry('node', self.nodes[i]);
                if(!node) return;
                if(node.appended) {
                    node.remove();
                    i--;
                }
                else node.reset();
            }

            // redetermine which are my deep nodes
            self.calculateDeepNodes();
        }


        /*
            Node: wrapper class for the 'node' database table.
        */
        function Node() {
            Entry.prototype.constructor.call(this);

            // A 0-type child has me as its head; a 1-type has me as its reference
            this.children = {0: {}, 1: {}};

            // index of head-child-reference triplets where I am the head
            // If triads[concept id][reference id] exists, then I have a child of concept {concept id}
            // whose reference node is {reference id} - used in Node.prototype.updateMatches
            this.triads = {};

            // currently using a wrapper class that allows the value of a node to be any set of real numbers & intervals
            // this may turn out to be unnecessary
            this.value = new Value(); // the Value prototype is defined below

            // this node may be an instance of multiple concepts, and during evaluation it may be found
            // that it is an instance of additional concepts as well; for each concept, we note whether
            // its commands have been compiled for this node, and whether it has been evaluated as that concept
            // - see Node.prototype.updateMatches below and Node.prototype.compileCommands in nodeData.js
            this.conceptInfo = {};

            // each node can store a tree containing information about that node's visual, symbolic, and numeric
            // representations; this data is resolved by executing the node's commands.  For much more, see nodeData.js
            this.data = new NodeData(this);
            // the data commands can store information in temporary variables which are then used by other commands
            this.variables = new NodeVariables(this); // defined in nodeData.js
            // this node's data commands, indexed by their ID (see NodeDataCommand.prototype in nodeData.js)
            this.commands = {};

            // when a law that represents a problem description is evaluated, any appended knowledge may be marked
            // as tentative so that it will not be included into the description until the user says so
            this.tentative = false;

            // whether this node has already been drawn on the diagram
            this.drawn = false;
            // whether it has been visualized in the visualization canvas
            this.visualized = false;

            // make sure all fields are set to their default values at first
            this.reset();
        }

        Node.prototype = Object.create(Entry.prototype);
        Node.prototype.constructor = Node;
        Node.prototype.table = 'node';

        /*
            set: override the Entry.prototype function to perform necessary actions when certain
            fields of this node are set.
        */
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
                    this[key] = value;
                    break;
            }
        };

        /*
            preprocess: in case this node record already existed and is now being updated,
            we need to unlink it from other nodes and un-index its concept from the predicate index,
            as its node connections and concept may be changed.
        */
        Node.prototype.preprocess = function() {
            this.removeChildren();
            Misc.deleteIndex(Law.predicateTop, this.concept, this.id);
        };

        // get the record of the law that this node is a part of
        Node.prototype.getLaw = function() {
            return this.findEntry('law', this.law);
        };

        // get the record of this node's primary concept
        Node.prototype.getConcept = function() {
            return this.findEntry('concept', this.concept);
        };

        // get an object containing all concepts that this node is explicitly marked as.
        // this includes its primary concept as well as any concepts it has been assigned
        // during evaluation
        Node.prototype.getConcepts = function() {
            return this.collectData('concept'); // defined in nodeData.js
        };

        // get an object containing all concepts of which this node is an instance.
        // this includes its primary concept, all concepts it has been assigned through evaluation,
        // and the dependency trees of all the above.
        Node.prototype.getAllConcepts = function() {
            let concepts = {}, conceptData = this.collectData('concept');
            if(!conceptData[this.concept]) conceptData[this.concept] = this.getConcept();
            for(let id in conceptData) {
                let concept = conceptData[id];
                if(!(concept instanceof Concept)) continue;
                let all = concept.getAllConcepts();
                for(let cid in all) {
                    concepts[cid] = all[cid];
                }
            }
            return concepts;
        };

        // check if the node's primary concept is an instance of the given concept
        Node.prototype.instanceOf = function(concept) {
            return this.getConcept().instanceOf(concept);
        };

        // return the numeric value assigned to this node, if it only has one
        Node.prototype.getValue = function() {
            if(this.value && this.value.values.length == 1)
                return this.value.values[0];
            return null;
        };

        // set the value assigned to this node
        Node.prototype.setValue = function(value) {
            if(value == null) return;
            if(typeof value == 'string') this.value.readValue(value);
            else if(typeof value == 'object') this.value.readValue(value.writeValue());
        }

        // return the symbol of the first concept on this node that has a symbol,
        // starting from its primary concept and working up the dependency chain
        // call this function with no argument to start from the primary concept
        Node.prototype.getDefaultSymbol = function(concept) {
            let self = this;

            // no argument given => start with the primary concept
            if(!concept) concept = self.getConcept();

            // if that concept has a symbol return it
            if(concept.symbol != null) {
                let symbol = ''+concept.symbol;
                if(symbol) return symbol;
            }

            // otherwise go up the dependency tree of that concept and find the first that has a symbol
            for(let dep in concept.dependencies) {
                let depConcept = self.findEntry('concept', dep);
                if(!depConcept) return;
                let symbol = self.getDefaultSymbol(depConcept);
                if(symbol) return symbol;
            }
            return '';
        };

        // get the record of this node's head node
        Node.prototype.getHead = function() {
            return this.findEntry(this.table, this.head);
        };

        // get the record of this node's reference node
        Node.prototype.getReference = function() {
            return this.findEntry(this.table, this.reference);
        };

        // pass 0 for 'type' to get the head, 1 to get the reference
        Node.prototype.getParent = function(type) {
            return type == 0 ? this.getHead() : type == 1 ? this.getReference() : null;
        };

        // set the head node of this node to that with the given ID
        Node.prototype.setHead = function(id) {
            this.setParent(0, id);
        };

        // set the reference node of this node to that with the given ID
        Node.prototype.setReference = function(id) {
            this.setParent(1, id);
        };

        // set the specified parent to the node with the given ID
        Node.prototype.setParent = function(type, id) {
            let name = type === 0 ? 'head' : 'reference';

            // get the node which is currently this node's parent of the given type
            let currentParent = this.findEntry('node', this[name]);
            // if there is one, unlink it from this node
            if(currentParent) currentParent.removeChild(type, this.id);

            // get the new parent, ie. the node whose ID was given, and link it to this one
            this[name] = id;
            let newParent = this.findEntry('node', this[name]);
            if(newParent) newParent.addChild(type, this);

            // make each of my parents aware that it forms a triad with me and my other parent
            if(this.head !== undefined && this.reference !== undefined) {
                let head = this.getHead(), reference = this.getReference();
                if(head) head.addTriad(0, this, this.reference);
                if(reference) reference.addTriad(1, this, this.head);
                // some node data commands reference the child nodes of the command node;
                // so the command must be re-compiled for each new child that is added
                // see Node.prototype.getConnectedNodes below where the 'new-child' listener is created;
                // that function is called from nodeData.js when compiling commands
                if(head) head.trigger('new-child', this);
            }
        };


        // get the root node of the tree that this node is in; this is used when setting the head/reference
        // of the node, because a node with no specified reference is considered to refer to ROOT by default.
        // no need to pass nodesChecked, it will be intialized here and used to keep track of recursion
        Node.prototype.getRoot = function(nodesChecked) {
            let self = this;

            // if the recursion has already passed over this node, nothing to do
            if(typeof nodesChecked === 'object' && nodesChecked[self.id]) return null;

            // create index to track which ancestor nodes have already been checked during recursion
            if(!nodesChecked) nodesChecked = {};
            // mark this node as now having been checked
            nodesChecked[self.id] = true;

            // if this is a node of concept 'ROOT' and has no parent nodes, it is the root of the tree
            if(self.head == null && self.reference == null && self.getConcept().name === 'ROOT')
                return self;

            // otherwise we recursively check this nodes parents
            let head = self.getHead(), ref = self.getReference(), root = null;
            if(head) root = head.getRoot(nodesChecked);
            if(ref && !root) root = ref.getRoot(nodesChecked);

            // there may be a detached part of a tree with no root, in which case it will only
            // connect to the root through its children
            if(!root) self.getChildren().every(function(child) {
                return !(root = child.getRoot(nodesChecked));
            });
            return root;
        };

        // add a child node of the given type (0 if I am the head, 1 if reference)
        Node.prototype.addChild = function(type, node) {
            Misc.setIndex(this.children, type, node.id, node);
        };

        // index the triad consisting of me, my specified child node, and that child's other parent
        Node.prototype.addTriad = function(type, node, otherId) {
            // index first on whether I am head or reference,
            // then on the concept of the child node,
            // then on the other parent node's ID
            Misc.setIndex(this.triads, type, node.concept, otherId, node);
            // this index will be unique because a given node can only have one child of a particular concept
            // relative to a given other node.  For example, body A can only have one velocity relative to body B,
            // though it can have another velocity relative to body C.  Similarly, body A can have multiple forces
            // relative to body B, but they must be different types of forces, and therefore different concepts.
        };

        // get all children of whom I am the head (type = 0) or all children of whom I am the reference (type = 1)
        // or all children (omit type)
        // returns an array of child node records
        Node.prototype.getChildren = function(type) {
            //if type not specified, we give both types be default
            let self = this, children = [], types = type === undefined ? [0,1] : [type];
            types.forEach(function(t) {
                for(let id in self.children[t]) {
                    children.push(self.children[t][id]);
                }
            });
            return children;
        };

        // get all children of the given type whose concept is an instance of the specified one
        Node.prototype.getChildrenByConcept = function(concept, type) {
            let self = this, children = [], types = type === undefined ? [0] : [type];
            types.forEach(function(t) {
                for(let id in self.children[t]) {
                    let child = self.children[t][id];
                    if(child.instanceOf(concept)) children.push(child);
                }
            });
            return children;
        };

        // unlink a child node (used for example when changing that node's parent)
        Node.prototype.removeChild = function(type, id) {
            delete this.children[type][id];
        };

        // unlink all child nodes of the given type
        Node.prototype.removeChildren = function(type) {
            let self = this, types = type === undefined ? [0,1] : [type];
            types.forEach(function(t) {
                self.children[t] = {};
            });
        };

        // remove this node from memory, and from the diagram.  Used in Law.prototype.reset above,
        // and in syncGraph in diagram.js
        Node.prototype.remove = function() {
            // unlink from both parents
            this.setHead(null);
            this.setReference(null);
            // remove from the global list of nodes and from the diagram
            if(this.relation) this.relation.removeEntry('node', this.id); // defined below
            let law = this.findEntry('law', this.law);
            // remove from the law's list of nodes
            if(law) law.removeNode(this.id);
        };

        // undo anything that was done to this node during evaluation:
        Node.prototype.reset = function() {
            // set as un-evaluated
            this.evaluated = {};
            this.matches = {};
            // unlink from any maps it was part of
            this.maps = {};
            this.fromMap = {};
            // mark all concepts as un-compiled & un-evaluated
            for(let cid in this.conceptInfo) {
                delete this.conceptInfo[cid];
            }
            // empty this node's data tree
            this.data.clear();
            // delete all compiled commands on this node
            for(let id in this.commands) delete this.commands[id];
            // remove any event handlers that were set up
            for(let evt in this.eventHandlers) delete this.eventHandlers[evt];
            this.visualized = false;
        }

        // mark this node as one of the deep nodes in a predicate of its law
        Node.prototype.setDeepPredicate = function() {
            this.isDeepPredicate = true;
            // also means this node and all its ancestors are predicate nodes in general
            this.setAsPredicate();
        }

        // mark this node and all its ancestors as predicate nodes,
        // meaning they belong to at least one predicate of their law
        // (if a node is in a predicate, its parents must be in the same predicate)
        Node.prototype.setAsPredicate = function() {
            let self = this;

            //me and all my ancestors are predicate nodes
            self.isPredicate = true;
            let head = self.getHead(), ref = self.getReference();
            if(head) head.setAsPredicate();
            if(ref) ref.setAsPredicate();

            //if I have no parents I am a top predicate node
            if(!head && !ref) {
                if(!Law.predicateTop[self.concept]) Law.predicateTop[self.concept] = {};
                Law.predicateTop[self.concept][self.id] = true;
            }
        };

        // mark this node as being supplied by the given map,
        // meaning this is one of the nodes that was appended by applying that map's law
        Node.prototype.addFromMap = function(map) {
            let self = this;
            // the same node could result from different law applications;
            // we track them all, so that if one map is un-appended, the node stays
            // as long as it is supplied by another law application
            self.fromMap[map.id] = map;
            // if this map is being appended, not tentatively, then the node is no longer tentative
            // but if the map is tentative, the node might not be, if it is part of another non-tentative map
            if(!map.tentative) self.tentative = false;
        };

        // set whether this node is tentative based on whether its map is tentative
        // used in evaluate.js when a new node is added while applying a law
        // also in suggest.js when making an applied law non-tentative (calls Map.prototype.setTentative which calls this)
        Node.prototype.setTentative = function(map) {
            let self = this;

            // if the map is not tentative, the node is not either; but if the map is tentative,
            // the node is only tentative if it's not part of another non-tentative map
            self.tentative = map.tentative;
            if(self.tentative) {
                for(let mapId in self.fromMap)
                    if(!self.fromMap[mapId].tentative) self.tentative = false;
            }

            // each parent of this node that is also in the given map receives the same treatment
            for(let i = 0; i < 2; i++) {
                let parent = self.getParent(i);
                if(parent && parent.fromMap[map.id] === map)
                    parent.setTentative(map);
            }

            // once a node is non-tentative it has to be drawn in the diagram
            if(!self.tentative) {
                self.relation.drawNode(self.id, {
                    template: 'appended',
                    drawLinks: true
                });
                // and its commands can be compiled so that it can be visualized, symbolized, etc.
                self.compileCommands(true);
            }
        };


        /*
            getConnectedNodes: get an array of all nodes connected to this one in the way specified
            by 'chain', which can be either an array or a period-separated string of capital letters.
            'S' stands for this node, 'A' for its head, 'B' its reference, and 'C' its children.
            So for example, 'A.B' gets the reference of the head of this node, while 'B.C' gets all
            child nodes of its reference, and 'S' returns this node only.

            If the chain is passed as an array, each of its elements can either by a letter as above,
            or an object with 'name', 'concept', and 'exclude' keys.  The name is the letter, the concept
            is the name of a concept record to filter for, and 'exclude' is a boolean telling whether to include
            or exclude that concept.  For example, if 'chain' is ['A', {name: 'B', concept: 'body', exclude: true}],
            then we get the reference of the head of this node, but only if that reference node is NOT of concept 'body'.
            If exclude=false, then we would return it if it IS of concept 'body'.

            If a callback function is provided, it will be executed on each matching node before they are returned.

            Used in nodeData.js when compiling commands.
        */
        Node.prototype.getConnectedNodes = function(chain, callback) {

            // parse the chain into an array if not already
            if(typeof chain === 'string') chain = chain.split('.');

            // start with a node set containing only this node; each letter will tell us what connected nodes to
            // get from the current node set
            let self = this, nodes = [self];

            // iterate over each link in the chain
            chain.forEach(function(el, ind) {

                //parse this element depending on whether it is a single letter or an object as described above
                let name = null, concept = null, exclude = false;
                if(typeof el === 'string') name = el;
                else if(typeof el === 'object') {
                    name = el.name;
                    concept = el.concept;
                    exclude = el.exclude;
                }
                if(!name) return;

                //find the array of nodes that are connected to the previous node array by the current link type
                let arr = [];
                nodes.forEach(function(node) { // nodes is the previous node array
                    switch(name[0]) {
                        case 'S': arr.push(node); break;
                        case 'A': arr.push(node.getHead()); break;
                        case 'B': arr.push(node.getReference()); break;
                        // for this function 'children' means only those nodes that have me as their head
                        case 'C': arr = arr.concat(node.getChildren(0));
                            // a node can acquire more children later, so we need to set up the callback function
                            // to execute on each child that may be added to this node.
                            if(typeof callback === 'function') {
                                // whatever part of the chain we haven't yet traversed, must be traversed starting
                                // from any new child that is added, and the callback called on the resulting nodes
                                let sub = chain.slice(ind+1);
                                // we do this by adding an event listener to the 'new-child' event, which is triggered
                                // when the new child is linked to this one in Node.prototype.setParent
                                node.on('new-child', function(child) {
                                    // make sure the new child matches the concept filter if any
                                    if(concept && (child.concept == concept) === exclude) return;
                                    // if this 'C' is the end of the chain, the child is the result so we call the callback on it
                                    if(sub.length === 0) callback.call(self, child);
                                    else child.getConnectedNodes(sub, callback);
                                });
                            }
                            break;
                        default: break;
                    }
                });
                // if this link has a concept filter, keep only those nodes that match it
                if(concept) arr = arr.filter(function(node) {
                    return (node.concept == concept) === !exclude;
                });
                // this now becomes the previous node array which will be linked from in the next iteration
                nodes = arr;
            });
            // call the callback function on all matching nodes, if any
            if(typeof callback === 'function') {
                nodes.forEach(function(node) {
                    callback.call(self, node);
                });
            }
            return nodes;
        };

        /*
            addToEvaluateQueue: add this node to its law's queue to be evaluated.  Its parents will be
            added before it, so that the nodes of the law are evaluated in a breadth-first manner.  This
            allows us to match law predicates from the top down, so that a partial match can be re-used
            with multiple children - see Node.prototype.updateMatches below.
        */
        Node.prototype.addToEvaluateQueue = function() {
            let self = this, opts = self.relation.options.evaluate, law = self.getLaw();
            if(law.inEvaluateQueue(self)) return;
            // recursively add my parents to the queue before me
            let head = self.getHead(), ref = self.getReference();
            if(head) head.addToEvaluateQueue();
            if(ref) ref.addToEvaluateQueue();
            // don't evaluate tentative nodes (haven't been accepted into the tree by the user yet)
            if(self.tentative) return;
            // don't re-evaluate this node if it already has been
            if(opts && self.evaluated[self.relation.getEvaluateTag()]) return;
            // there may be a filter set in the global options to exclude certain nodes from evaluation
            if(opts && opts.includeNode && !opts.includeNode.call(self)) return;
            law.addToEvaluateQueue(self);
        };

        // check if this node has already been evaluated
        Node.prototype.evaluated = function() {
            return this.evaluated[self.relation.getEvaluateTag()];
        };

        // mark this node as having been evaluated (true) or reset it (false) so that it can be re-evaluated
        Node.prototype.setEvaluated = function(evaluated) {
            this.evaluated[self.relation.getEvaluateTag()] = evaluated;
        };

        /*
            Determine what nodes in any predicate description this node matches,
            based on its concept and what its parents have already matched.  This is why we
            always evaluate a node's parents before it (see Node.prototype.addToEvaluateQueue above).
        */
        Node.prototype.updateMatches = function() {
            let self = this;

            // don't evaluate nodes that are still tentative
            if(self.tentative) return;

            // get a list of all concepts of which this node is an instance - it may match a predicate based on any of them
            let concepts = self.getAllConcepts(),
                wildcard = Concept.prototype.wildcardConcept,
                wildcardConcept = self.relation.findEntry('concept', wildcard),
                newMatch = false;

            //first check if this node matches a top-level node from any predicate description
            concepts[wildcard] = wildcardConcept;
            for(let cid in concepts) {
                if(Misc.getIndex(self.conceptInfo, cid, 'evaluated')) continue;
                Misc.setIndex(self.conceptInfo, cid, 'evaluated', true);
                for(let nodeId in Law.predicateTop[cid]) {
                    if(self.setMatch(nodeId)) newMatch = true;
                }
            }

            // then check existing partial matches on my parents, and add me to them if appropriate
            // check each triad of: head match - self concept - reference match
            // but only where at least one of the 3 is new since the last time this
            let head = self.getHead(), headMatches = head ? head.matches : {0: null},
                ref = self.getReference(), refMatches = ref ? ref.matches : {0: null};

            // loop through each concept of which this node is an instance
            for(let cid in concepts) {
                let concept = concepts[cid];

                // loop through each node that my head has already matched
                for(let hid in headMatches) {

                    // if the node my head matched was already deep, it can't have any children for me to match
                    let headMatch = headMatches[hid];
                    if(headMatch && headMatch.isDeepPredicate) continue;

                    // loop through each node that my reference has matched
                    for(let rid in refMatches) {

                        // now we have a triad of { head matching node } - { self concept } - { reference matching node }
                        // we want to see if the head and reference matching nodes are (1) from the same law, and
                        // (2) have a child between them that has the same concept as me.  If so, I match that child.

                        // skip this triad if it was previously checked
                        if(Misc.getIndex(self.conceptInfo, cid, hid, rid, 'evaluated')) continue;
                        Misc.setIndex(self.conceptInfo, cid, hid, rid, 'evaluated', true);

                        // if the node my reference matched was already deep, it can't have any children for me to match
                        let refMatch = refMatches[rid];
                        if(refMatch && refMatch.isDeepPredicate) continue;

                        // finally, see if this triad is a match
                        let match = null;
                        if(headMatch) match = headMatch.getMatch(0, cid, rid); // defined below
                        else if(refMatch) match = refMatch.getMatch(1, cid, hid);
                        // make sure the matching child is also a predicate node
                        if(match && match.isPredicate && self.setMatch(match)) newMatch = true;;
                    }
                }
            }

            // if I was matched to anything new, my children need to be re-evaluated
            if(newMatch) {
                self.getChildren().forEach(function(child) {
                    child.setEvaluated(false);
                    child.addToEvaluateQueue();
                })
            }

            // mark me as having been evaluated
            self.setEvaluated(true);
        };

        // see if I have a child of concept 'conceptId' where I am the parent of type 'type' (see Node.prototype.setParent)
        // and the child's other parent is 'nodeId' - if so, return the child node.
        Node.prototype.getMatch = function(type, conceptId, nodeId) {
            return Misc.getIndex(this.triads, type, conceptId, nodeId) || null;
        };

        // mark this node as matching the given predicate node.
        Node.prototype.setMatch = function(node) {
            let self = this, nodeId = null;

            // node may be passed as either an ID or the node record; in either case, make sure we have both the ID and the record
            if(node instanceof Node) {
                nodeId = node.getId();
            } else {
                nodeId = node;
                node = self.findEntry('node', nodeId);
            }
            if(!node) return false;

            // make sure the law the matching node is part of is one that can be applied during this round of evaluation
            let law = node.getLaw();
            let opts = self.relation.options.evaluate;
            if(law.hasTag('inactive') || // don't apply inactive laws
                opts.frameworks && opts.frameworks.indexOf(law.framework) < 0 || // global options may specify we're only using certain frameworks
                (opts.useLaw && !opts.useLaw.call(self, law)) || // may specify a filter to exclude certain laws
                (opts.tag && !law.hasTag(opts.tag)) || // may specify a tag that a law must have to be applied
                (!opts.tag && law.hasTag('visualization'))) // I was playing with using laws for visualization but currently obselete
                    return;

            // mark this node as matching the specified predicate node
            self.matches[nodeId] = node;

            // if that node is a deep node of the predicate, we create a mapping from the predicate node & its ancestor tree
            // to the corresponding nodes in this law.  This map can later be merged with other maps until finally we cover an entire
            // predicate set of the law, and then the law can be applied.  See evaluate.js for more.

            if(node.isDeepPredicate) {
                if(!self.getLaw().addMapFromNodes(self, node)) {
                    console.err("Couldn't create map for node " + self.id + ' [' + self.getConcept().name + ']');
                    console.err('  mapped to ' + node.toString());
                    return false;
                }
            }
            return true;
        };

        // get the data tree inside this node - see nodeData.js for implementation of node data
        Node.prototype.getData = function() {
            return this.data;
        };

        // used by appendDataNode in evaluate.js, but not really used in practice right now
        Node.prototype.getDataKey = function() {
            return this.getConcept().name;
        };

        // print a summary of this node to the console for debugging
        Node.prototype.toString = function() {
            let law = this.getLaw(), concept = this.getConcept();
            return this.id + ': ' + concept.name + ' [' + concept.id + '] in ' + law.name + ' [' + law.id + ']';
        };

        // debug function to print out the list of nodes that this node matches to the console
        Node.prototype.printMatches = function() {
            for(let nodeId in this.matches) {
                let node = this.findEntry('node', nodeId);
                if(node && node.concept != Concept.prototype.wildcardConcept)
                    console.log(node.id + ': ' + node.toString());
            }
        }


        /*
            wrapper class to store the numeric value associated with a node.
            It is designed to be able to store any subset of the real numbers (including continuous intervals),
            as well as tuples of such subsets.
            But the full functionality is not really being used right now and may turn out to be unnecessary.
            In particular, now that we have a data tree in each node (see nodeData.js), we could probably store
            all value information for the node within that tree.

            Example: if a problem description states that time is between 0 and 5 seconds, we could represent that
            by setting the Value of the 'time' node to the closed interval from 0 to 5.  This gets stored in the database
            and re-parsed when the law is opened later.
        */
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


        /*
            storeEntries: whenever we save or load anything, the server (via /controllers/default.py) passes us the
            corresponding records from the database.  We then create or update our local copy of those records to
            match what they sent us, and update the page to reflect the changes.
        */
        Relation.prototype.storeEntries = function(ajaxData) {
            let self = this;

            // ajaxData is the JSON response from the server (look at /controllers/default.py
            // to see how the server formats the data it sends us)
            if(!ajaxData || typeof ajaxData.entries != 'object') return;
            console.log('storing entries');
            console.info(ajaxData.entries);

            // the response may contain entries from multiple tables (for example, when we load a framework,
            // we get the framework record along with all concepts, laws, and nodes within that framework).
            // we store the 4 tables in the following order due to some tables depending on others
            let tables = ['concept', 'node', 'law', 'framework'], frameworkReset = false;

            // check each of the 4 tables to see if we got any of its records to store
            tables.forEach(function(table) {
                let data = ajaxData.entries[table];
                if(!data) return;
                let entries = self.getTable(table);
                let saved = {};

                //make sure all records are created with the proper IDs
                for(let id in data) {
                    if(isNaN(id)) continue;
                    id = parseInt(id);
                    // if this record was just created, then it had a temp ID (negative) before saving,
                    // and the server has just inserted it in the database with a new positive ID.
                    // The server therefore includes the old temp ID in the record it sends us,
                    // so that we can locate the local copy to update.
                    let oldId = data[id].oldId;
                    if(!entries[id]) {
                        if(oldId && entries[oldId]) {
                            entries[id] = entries[oldId];
                            delete entries[oldId];
                        } else entries[id] = self.createEntry(table);
                    }
                    entries[id].id = id;
                }
                //clear any indices on these records - to be recalculated after
                for(let id in data) {
                    let entry = entries[id];
                    if(!entry) continue;
                    // do anything that needs to be done before updating the record
                    entry.preprocess();
                }
                //update the data in each record
                for(let id in data) {
                    let entry = entries[id];
                    if(!entry) continue;
                    entry.store(data[id]);
                    saved[id] = true;
                }

                //once all records have been stored, post-process each record as needed, according to which table we are storing
                for(let id in saved) {
                    let entry = entries[id], oldId = data[id].oldId;
                    if(!entry) continue;

                    // perform any record-internal actions that need to happen after storing
                    entry.postprocess();

                    // then update the global relation object and the actual web page
                    switch(table) {
                        case 'framework':
                            // if the framework currently in use has been updated, reset the display name and the concept palette
                            if(self.framework && (self.framework.id == id || self.framework.id == oldId)) {
                                self.setFramework(entry);
                                frameworkReset = true;
                            }
                            break;
                        case 'law':
                            // if the law currently in use has been updated, update its display name draw it in the diagram if
                            // it wasn't before
                            if(self.law && (self.law.id == entry.id || self.law.id == oldId)) {
                                let notDrawn = !self.law.name;
                                self.setLaw(entry);
                                if(notDrawn) self.draw();
                            }
                            break;
                        case 'concept':
                            // any time a concept is updated, it needs to be updated in both the concept palette and shown or hidden
                            // depending on which framework is visible in the palette (according to the framework-filter)
                            let graphs = [self.palette, self.diagram];
                            for(let i = 0; i < graphs.length; i++) {
                                let graph = graphs[i], found = false;
                                // loop through all nodes in the palette/diagram and update the ones whose concept is the updated concept
                                graph.nodes.each(function(node) {
                                    if(node.data.concept == id) {
                                        found = true;
                                        graph.model.set(node.data, 'concept', id);
                                        graph.model.set(node.data, 'framework', data[id].framework);
                                        // updateTargetBindings forces the changes to be displayed
                                        graph.model.updateTargetBindings(node.data, 'concept');
                                    }
                                });
                                // if this concept is not yet in the palette (ie. it was just created), add it
                                if(graph === self.palette && !found) {
                                    graph.model.addNodeData({
                                        concept: id,
                                        framework: data[id].framework,
                                        visible: self.isVisibleInPalette(id) // defined in diagram.js
                                    });
                                }
                            }
                            break;
                        case 'node':
                            // when a node is updated, it must be updated in the diagram
                            let nodeData = self.diagram.model.findNodeDataForKey(id);
                            if(!nodeData && oldId) nodeData = self.diagram.model.findNodeDataForKey(oldId);
                            if(nodeData) {
                                // the data in the graph object contains some of the keys that the node record contains
                                // (those that are used to display the node)
                                // so we look for those that it has and make sure they have the new values
                                for(let key in entry)
                                    if(nodeData.hasOwnProperty(key))
                                        self.diagram.model.set(nodeData, key, entry[key]);
                                // updateTargetBindings forces the changes to be displayed
                                self.diagram.model.updateTargetBindings(nodeData);
                            }
                            break;
                        default: break;
                    }
                }
            });
            // if the current framework was modified or we switched to a new framework, we have to refilter the concept palette
            if(frameworkReset) self.filterPalette();
        };


        // create a new entry in the given table, containing the key-value pairs specified in 'data'
        // add=true means we add the new entry to the local list for the table; otherwise we just return it
        Relation.prototype.createEntry = function(table, data, add) {
            let self = this, entry = null;
            // create the new entry according to the specified table
            switch(table) {
                case 'framework': entry = new Framework(); break;
                case 'law': entry = new Law(); break;
                case 'concept': entry = new Concept(); break;
                case 'node': entry = new Node(); break;
                default: break;
            }
            if(entry instanceof Entry) {
                entry.relation = self;
                // if the 3rd argument is true, add the newly created entry to the global list for this table
                if(add) {
                    if(data.hasOwnProperty('id') && !isNaN(data.id)) entry.id = parseInt(data.id);
                    else entry.id = self.nextId[table]--;
                    let entries = self.getTable(table);
                    if(entries) entries[entry.id] = entry;
                }
                // every Entry object has a store function, but the specific wrapper classes may override it
                if(data && typeof data === 'object') entry.store(data);
            }
            return entry;
        };


        // given an Entry object for a given table, add it to the global list for that table
        Relation.prototype.addEntry = function(table, entry) {
            if(!entry.hasOwnProperty('id')) return false;
            let self = this, entries = self.getTable(table);
            entries[entry.id] = entry;
        };


        // find an entry from a given table given some specifying information in 'data'
        // which can be a string (name), number (ID), or an object containing key-value pairs,
        // in which case the matching entry must contain all of those pairs
        Relation.prototype.findEntry = function(table, data) {
            let self = this, entries = self.getTable(table);
            if(!entries) return null;

            // if data is a number, look for an entry with that ID
            // (the global list is indexed by ID, so we just look for an entry at that index)
            if(!isNaN(data)) return entries[data] || null;

            // if data is a string, we look for an entry with that name
            if(typeof data === 'string') data = {name: data};

            // otherwise data is a set of key-value pairs, and we look for an entry with all of them
            if(typeof data === 'object') {
                //loop through all entries in the global table list
                for(let id in entries) {
                    // assume the entry matches until proven otherwise
                    let entry = entries[id], match = true;
                    switch(table) {
                        // ignore nodes that are specific to a single node - only global entries
                        case 'concept': if(entry.node_specific) continue;
                            break;
                    }
                    // loop through all specified key-value pairs until we find one that doesn't match
                    for(let key in data) {
                        if(entry[key] != data[key]) {
                            match = false;
                            break;
                        }
                    }
                    // otherwise the entry is indeed the matching one
                    if(match) return entries[id];
                }
            }
            return null;
        };

        // find the ID of the entry that matches the given data (via findEntry above)
        Relation.prototype.findId = function(table, data) {
            let self = this, entry = self.findEntry(table, data);
            return entry instanceof Entry ? entry.id : null;
        };


        // find the entry with the given ID in the specified table or create it if it doesn't exist
        Relation.prototype.findOrCreateEntry = function(table, id) {
            let self = this, entry = self.findEntry(table, id);
            if(entry !== null) return entry;
            return self.createEntry(table, {id: id}, true);
        }


        // remove the entry with the given ID from the local copy of the given table
        // if it is a node, also remove it from the diagram
        Relation.prototype.removeEntry = function(table, id) {
            let self = this, entries = self.getTable(table);
            if(entries && entries.hasOwnProperty(id)) {
                delete entries[id];
                // nextId stores the next temporary ID, which is negative,
                // so if we are deleting the record with the previously assigned temporary ID,
                // we can re-use that for the next record that is created
                if(id == self.nextId[table]+1) { // since temp IDs are negative, the previously used ID is nextID + 1
                    let newId = id+1;
                    // find the smallest (most negative) temp ID that is still in use
                    while(newId < 0 && !entries.hasOwnProperty(newId)) newId++;
                    // the next ID can be the one following that (1 more negative)
                    self.nextId[table] = newId-1;
                }
            }
            // put any actions that should be performed for the given table when a record is deleted
            switch(table) {
                case 'framework': break;
                case 'concept': break;
                case 'law': break;
                // for nodes, they should be removed from the diagram
                case 'node':
                    // find the GoJS node object representing this node in the diagram
                    let graphNode = self.diagram.findNodeForKey(id); // see GoJS documentation
                    if(graphNode) {
                        // remove all links coming into or out of this node
                        let links = graphNode.findLinksConnected(), linkData = [];
                        while(links.next())
                            linkData.push(links.value.data);
                        linkData.forEach(function(data) {
                            self.diagram.model.removeLinkData(data);
                        });
                        // remove the node itself
                        self.diagram.model.removeNodeData(graphNode.data);
                    }
                    break;
            }
        };

        // get the local list of records from the given database table
        // (won't necessarily reflect the whole database table, only the records the user has loaded so far during this session)
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
