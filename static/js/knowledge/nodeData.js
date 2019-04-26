/*

Because we need to represent law description trees in more understandable ways, ie. through pictures and symbols,
we store data in each node which contains the information needed to visualize or symbolize it.
This data is stored as a tree within the node, and is implemented by the NodeData prototype defined below.

Similarly, each concept stores a set of commands that manipulate the NodeData tree.  This is the NodeDataCommand
prototype below.  Commands have a particular format.  Consider this command of the 'component' concept,
which represents a component of a vector, to illustrate:

    A.visual.delta:R += S.value * B.visual.delta:R

The 'A', 'S', and 'B' prefixes represent nodes connected to the given node.  'A' stands for head, 'B' for reference,
'S' for self, and 'C' for children.  For a 'component', the head will be a 'vector', and the reference will be a
'direction'.  The direction will have a 'visual.delta' data key, which represents the x,y pixel components of that
direction's unit vector on screen.  Likewise, the component will have a 'value' key which stores the magnitude of
that component.  We multiply the component by the unit vector, add those up for all components (hence the '+=' operator),
and we have the vector's x,y pixel components (it's 'visual.delta').

The 'visual.delta' means that 'visual' is under the root of the data tree, and 'delta' is under that.  This way, 'visual'
can have other sub-keys, and the entire 'visual' sub-tree is parsed in order to visualize the node.  If the key
to be modified by a command has not yet been created in the referenced node, it will be automatically.

The data tree is parsed in order to create the representations on the screen; this happens in represent.js.

The ':R' flag on the visual.delta keys stands for 'recursive'.  The visual.delta key actually has 'x' and 'y' subkeys
for the x and y pixel components, but instead of writing one command for each pixel direction, we use 'recursive'
to say the command should be executed on all matching subkeys of the specified key.

    (Note that the above scheme works for rectangular coordinate systems, but we might need to develop something
    more sophisticated in general)

The first part of the command is always the node/data-key pair that we are modifying.  Next is the operation
(in this case '+=') and then the expression.  In addition to the NodeDataCommand prototype, there is an Expression
prototype to wrap the expression.

A couple of operators on data trees are hard-coded below, but if the operator is not one of these, it is assumed to
be raw JavaScript.  Likewise, any part of the expression that is not a reference to node data is parsed as JavaScript.

The code below enables a node to initialize its data tree, compile all commands supplied by its concept(s), and
execute those commands.  This code is called primarily by the Law.prototype.resolveData function in databaseWrappers.js.

Since the command can execute on all subkeys via the ':R' flag, the Expression and NodeDataCommand need to store the results
for each subkey.  So they end up being trees, just like the NodeData.  So, we have all three prototypes inherit from
a generic prototype, called Dependency, which stores a tree of values.  Also, these three prototypes reference each other
in a cyclic way: node data may be used in an expression (S.value and B.visual.delta in the expression above), the
expression is used by its command, and the command modifies data (A.visual.delta above).  Once the data is resolved (all
commands that affect it have finished executing), the value of the data may in turn be used in some other expression in
the same or another node.  So, each has to wait for the other to resolve, and when it resolves it may trigger something
else.  For this reason, the Dependency prototype has functionality to wait on another Dependency, and trigger a
Dependency once it resolves.

Finally, there is a small prototype called NodeVariables, also a Dependency, allowing a command to store its result in
a temporary variable in the node, which may then be referenced by another command.

*/


/*
    initData: put the default values into this node's data tree before running any commands.
    This includes any numeric value assigned to the node, the default symbol of the node's concept,
    and the concept itself.  Storing the concept may turn out to be unnecessary, but I was thinking that
    the application of certain laws might determine that a node is an instance of another concept
    in addition to its primary one.
*/
Node.prototype.initData = function(type) {

    // if no type specified, initialize all types of data
    let self = this, types = type ? [type] : ['concept', 'symbol', 'value', 'visual'];

    types.forEach(function(type) {
        if(self.getData().getValue(type) !== undefined) return;
        switch(type) {
            case 'concept':
                // this way, the 'concept' key will hold all concepts the node has been marked as, indexed by their record ID
                self.setData('concept.' + self.concept, self.getConcept());
                break;
            case 'symbol':
                // the default symbol is the node's name if any, otherwise the symbol of its concept, or the
                // first of its inherited concepts that has a symbol
                let symbol = '';
                if(self.name) symbol = self.name;
                else {
                    let s = self.getDefaultSymbol();
                    if(s != null) symbol = s;
                }
                // The symbol is displayed as MathML via the MathJax plugin - see knowledge.html for description,
                // or MathML documentation for explanation of the <m...> tags
                // at http://www.math-it.org/Publikationen/MathML.html#Basic_Elements
                if(symbol) {
                    if(!isNaN(symbol)) symbol = '<mn>' + symbol + '</mn>';
                    else if(symbol.length == 1) symbol = '<mi>' + symbol + '</mi>';
                    else if(symbol.length > 1) symbol = '<mtext>' + symbol + '</mtext>';
                }
                // we treat the default text as the symbol's main text; the data commands may add keys
                // such as subscripts and superscripts that modify the main text
                self.setData('symbol.text', symbol);
                // the complete symbol text including subscripts etc. will be stored in the 'symbol' key in MathML format
                self.setData('symbol', '');
                break;
            case 'value':
                // if the node has a specified numeric value
                let value = self.getValue();
                if(value) self.setData('value', value);
                else self.setData('value', undefined);
                break;
            case 'visual':
                break;
            default: break;
        }
    });
};


/*
    compileCommands: take the raw commands from all concepts of this node, and parse them into
    NodeDataCommand objects by determining what nodes and data keys they reference, what operation
    they are performing, etc.
*/
Node.prototype.compileCommands = function(doCheck) {
    let self = this;

    // if commands have already been compiled on this node, activate those whose data type is currently being propagated
    for(let id in self.commands) {
        self.commands[id].checkActive();
    }

    // make a list of concepts that have not yet been compiled on this node
    self.initData('concept'); // start by making sure our primary concept is in the tree if nothing else
    // get all dependency concepts from those marked in the tree
    let concepts = self.getAllConcepts(), commandStrings = [];
    for(let id in concepts) {
        // remove those from the list that have already been compiled
        if(Misc.getIndex(self.conceptInfo, id, 'compiled')) delete concepts[id];
        else {
            commandStrings.push.apply(commandStrings, concepts[id].getCommands());
            // and mark the others as compiled so they won't be re-compiled next time
            Misc.setIndex(self.conceptInfo, id, 'compiled', true);
        }
    }

    // compile each as yet uncompiled command
    commandStrings.forEach(function(commandStr) {
        if(!commandStr) return;

        // split the command into tokens separated by whitespace
        let tokens = commandStr.split(/\s+/),
            tgt = tokens.shift(),   // the first token is the node/data key that this command will modify
            op = tokens.shift(),    // next is the operation to be performed on that key
            exp = tokens.join(' '), // the rest of the command is the expression to be passed to the operator
            context = false;    // false if the node references in the expression are relative to this node,
                                // true if they are relative to the target node

        // figure out which node/data key pair we are modifying (the target)
        let tgtRef = self.parseReferences(tgt)[0];
        if(!tgtRef || tgtRef.start > 0 || tgtRef.end < tgt.length) return; // the entire target token should be parsed to a reference

        // the target may modify a temporary variable in this node, to be referenced by another command elsewhere
        if(tgtRef.type === 'var') {
            // find all node/data references in the expression
            let expression = self.parseExpression(exp);
            //
            let command = new NodeDataCommand(null, tgtRef.key, op, expression, tgtRef.recursive, tgtRef.variable);
            command.wait(self.variables, tgtRef.var);
        } else if(tgtRef.type === 'node') {
            let expression = null;
            if(!tgtRef.nodeAsContext) expression = self.parseExpression(exp);
            self.getConnectedNodes(tgtRef.nodes, function(node) {
                if(tgtRef.nodeAsContext) expression = node.parseExpression(exp);
                let command = new NodeDataCommand(node.getData(), tgtRef.key, op, expression, tgtRef.recursive, tgtRef.variable);
                if(doCheck) {
                    command.checkResolved('', true);
                }
            });
        }
    });
};

Node.prototype.parseExpression = function(str) {
    let self = this, expression = new Expression();
    let refs = self.parseReferences(str), ind = 0;
    refs.forEach(function(ref) {
        if(ref.start > ind)
            expression.addLiteralBlock(str.substring(ind, ref.start));
        if(ref.type === 'var') {
            let blockNum = expression.addReferenceBlock(null, null, ref.recursive);
            expression.wait(self.variables, ref.var, '', function(vars, varName) {
                let value = vars.getValue(varName);
                expression.setReference(blockNum, value.dep, Dependency.concatKey(value.key, ref.key));
            });
        } else if(ref.type === 'node') {
            let refNode = self.getConnectedNodes(ref.nodes)[0];
            if(refNode) {
                expression.addReferenceBlock(refNode.getData(), ref.key, ref.recursive);
            } else {

            }
        }
        ind = ref.end;
    });
    if(ind < str.length) expression.addLiteralBlock(str.substring(ind));
    return expression;
};

function refRegex() {

    let alphaNum = '[A-Za-z][A-Za-z0-9]*',
        nodeId = '(?:A|B|C|S)(?:\\(!?' + alphaNum + '\\))?',
        nodeIdCapture = '(A|B|C|S)(?:\\((!?)(' + alphaNum + ')\\))?',
        nodeChain = nodeId + '(?:\\.' + nodeId + ')*';

    let mainStr = '(^|[^A-Za-z0-9])'                        //first character
        + '(\\$' + alphaNum + '|' + nodeChain + ')(:?)'     //data identifier
        + '((?:\\.[A-Za-z0-9]+)*)'                          //key chain
        + '((?::R)?)((?:>' + alphaNum + ')?)'               //data flags
        + '([^A-Za-z0-9]|$)';                               //last character

    return {
        main: new RegExp(mainStr, 'g'),
        node: new RegExp(nodeIdCapture)
    };
}

Node.prototype.parseReferences = function(str) {
    let self = this, regex = relation.regex, references = [];

    regex.main.lastIndex = 0;
    while((match = regex.main.exec(str)) !== null) {
        let first = match[1], data = match[2], context = match[3], key = match[4],
            opts = match[5], variable = match[6], last = match[7];

        let ref = {
            key: key || '',
            start: match.index,
            end: regex.main.lastIndex,
            nodeAsContext: context === ':',
            variable: variable.substring(1)
        };

        let bounded = first === '{' && last === '}';
        if(first && !bounded) ref.start++;
        if(last && !bounded) ref.end--;
        if(ref.key && ref.key[0] === '.') ref.key = ref.key.substring(1);

        if(data[0] === '$') {
            ref.type = 'var';
            ref.var = data.substring(1);
        } else {
            ref.type = 'node';
            ref.nodes = [];
            data.split('.').forEach(function(nodeStr) {
                let match = nodeStr.match(regex.node);
                let name = match[1], exclude = match[2], concept = match[3];
                let nodeObj = {name: name, concept: null, exclude: false};
                if(concept) {
                    let cid = self.findId('concept', concept);
                    if(cid) nodeObj.concept = cid;
                    if(exclude === '!') nodeObj.exclude = true;
                }
                ref.nodes.push(nodeObj);
            });
        }

        for(let i = 1; i < opts.length; i++) {
            switch(opts[i]) {
                case 'R': ref.recursive = true; break;
                default: break;
            }
        }
        references.push(ref);
    }
    return references;
};

Node.prototype.addCommand = function(command) {
    this.commands[command.getId()] = command;
};

Node.prototype.checkCommands = function() {
    for(let cid in this.commands) {
        let command = this.commands[cid];
        command.checkResolved('', true);
    }
};

Node.prototype.resetCommands = function() {
    for(let id in this.commands) {
        this.commands[id].reset();
    }
};

Node.prototype.printCommands = function() {
    for(let id in this.commands) {
        console.log(this.commands[id].toString());
    }
};

//generate a syntax tree from a node data command
Node.prototype.splitDataCommand = function(commandStr) {
    /* TODO */
};

Node.prototype.setData = function(key, value) {
    this.data.setValue(key, value);
};

Node.prototype.collectData = function(key) {
    return this.getData().collectData(key);
};

Node.prototype.printData = function(key) {
    this.getData().each(key, function(k, node) {
        let str = '' + k + ': ' + node.value;
        if(node.active) str += '\tactive';
        if(node.propagated) str += '\tpropagated';
        console.log(str);
    });
};

Node.prototype.setVariable = function(key, value) {
    this.variables.setValue(key, value);
};

Node.prototype.getVariable = function(key) {
    return this.variables.getValue(key);
};


function Dependency() {
    this.id = Dependency.prototype.nextId++;
    Dependency.prototype.instance[this.id] = this;
    this.key = {};
}
Dependency.prototype.nextId = 0;
Dependency.prototype.instance = {};
Dependency.prototype.propagateKey = {};

Dependency.propagate = function(type) {
    if(!type) {
        for(let key in Dependency.prototype.propagateKey)
            delete Dependency.prototype.propagateKey[key];
    } else Dependency.prototype.propagateKey[type] = true;
};

Dependency.setPropagating = function(type) {
    Dependency.propagate(null);
    Dependency.propagate(type);
};

Dependency.propagating = function(type) {
    if(Dependency.prototype.propagateKey['']) return true;
    if(type === 'concept') return true;
    return Dependency.prototype.propagateKey[type] ? true : false;
};

Dependency.cleanKey = function(key) {
    return key == null ? '' : '' + key;
};

Dependency.subkey = function(key, subkey) {
    key = Dependency.cleanKey(key);
    subkey = Dependency.cleanKey(subkey);
    if(subkey.length < key.length) return false;
    if(!key) return subkey;
    if(subkey === key) return '';
    if(subkey.indexOf(key) !== 0 || subkey[key.length] !== '.') return false;
    return subkey.substring(key.length+1);
};

Dependency.isChild = function(subkey, key) {
    subkey = Dependency.cleanKey(subkey);
    key = Dependency.cleanKey(key);
    if(!key) return subkey.match(/^[A-Za-z0-9]+$/) ? true : false;
    let len = key.length;
    return subkey.indexOf(key) === 0 &&
        subkey.substring(len).match(/^\.[A-Za-z0-9]+$/) ? true : false;
};

Dependency.concatKey = function(key1, key2) {
    key1 = Dependency.cleanKey(key1);
    key2 = Dependency.cleanKey(key2);
    let key = key1;
    if(key && key2) key += '.';
    key += key2;
    return key;
};

Dependency.getParent = function(key) {
    key = Dependency.cleanKey(key);
    if(!key) return undefined;
    return key.replace(/\.?[A-Za-z0-9]+$/, '');
};

Dependency.propagateValues = function() {
    for(let id in Dependency.prototype.instance) {
        let dep = Dependency.prototype.instance[id];
        dep.propagateValues();
    }
};

Dependency.clearCommands = function() {
    for(let id in Dependency.prototype.instance) {
        let dep = Dependency.prototype.instance[id];
        if(!(dep instanceof NodeData)) {
            dep.each('', function(key, node) {
                for(let depId in node.waiting) delete node.waiting[depId];
                for(let depId in node.trigger) delete node.trigger[depId];
            });
            console.log('deleting dep ' + id);
            delete Dependency.prototype.instance[id];
        }
    }
    let nextId = Dependency.prototype.nextId;
    while(!Dependency.prototype.instance.hasOwnProperty(nextId)) nextId--;
    Dependency.prototype.nextId = nextId+1;
};

function dep(id) {
    return Dependency.prototype.instance[id];
}
function node(id) {
    return relation.nodes[id];
}

Dependency.prototype.getId = function() {
    return this.id;
};

Dependency.prototype.getKeys = function() {
    return Object.keys(this.key);
};

Dependency.prototype.getKey = function(key, create) {
    key = Dependency.cleanKey(key);
    let node = this.key[key];
    if(create && !node) node = this.key[key] = {
        waiting: {},
        trigger: {},
        active: false,
        propagated: false,
        value: undefined
    };
    return node;
};

Dependency.prototype.each = function(key, callback) {
    for(let k in this.key) {
        let subkey = Dependency.subkey(key, k);
        if(subkey !== false) {
            if(callback.call(this, subkey, this.key[k]) === false) return false;
        }
    }
    return true;
};

Dependency.prototype.eachChild = function(key, callback) {
    for(let k in this.key) {
        if(Dependency.isChild(k, key)) {
            if(callback.call(this, k, this.key[k]) === false) return false;
        }
    }
    return true;
};

Dependency.prototype.getValue = function(key) {
    let node = this.getKey(key);
    if(node) return node.value;
    else return undefined;
};

Dependency.prototype.setValue = function(key, value) {
    this.getKey(key, true).value = value;
};

Dependency.prototype.active = function(key) {
    let node = this.getKey(key);
    if(node) return node.active || false;
    else return false;
};

Dependency.prototype.activate = function(key, active) {
    let self = this;
    active = (active === undefined ? true : active) || false;

    self.each(key, function(k, node) {
        if(node.active == active) return;
        node.active = active;
        for(let depId in node.waiting) {
            for(let depKey in node.waiting[depId]) {
                let obj = node.waiting[depId][depKey];
                obj.dep.activate(depKey, active);
                if(active && obj.dep.propagated(depKey)) {
                    self.resolve(obj.dep, depKey, k);
                }
            }
        }
    });
};

Dependency.prototype.reset = function() {
    this.each('', function(key, node) {
        if(!node.active) return;
        node.active = false;
        for(let depId in node.waiting) {
            for(let depKey in node.waiting[depId]) {
                let obj = node.waiting[depId][depKey];
                obj.resolved = false;
                obj.dep.reset();
            }
        }
    });
};

Dependency.prototype.wait = function(dep, depKey, myKey, callback) {
    let node = this.getKey(myKey, true);
    Misc.setIndex(node.waiting, dep.getId(), depKey, {
        dep: dep,
        callback: callback,
        resolved: false,
    });
    dep.addTrigger(this, depKey, myKey);
    //console.log(this.toString(myKey) + ' waiting on ' + dep.toString(depKey));
};

Dependency.prototype.addTrigger = function(dep, key, depKey) {
    let node = this.getKey(key, true);
    Misc.setIndex(node.trigger, dep.getId(), depKey, dep);
    if(this.active(key) && this.propagated(key)) {
        dep.resolve(this, key, depKey);
    }
};

Dependency.prototype.resolve = function(dep, depKey, myKey) {
    let self = this;
    if(!self.active(myKey) || self.propagated(myKey)) return false;

    let depId = dep.getId(), node = this.getKey(myKey),
        obj = Misc.getIndex(node.waiting, depId, depKey);
    if(node.known || !obj || obj.resolved) return true;

    //console.log(this.toString(myKey) + ' resolving ' + dep.toString(depKey) + ' to ' + dep.getValue(depKey));

    let callback = obj.callback;
    if(typeof callback === 'function') callback.call(this, dep, depKey, myKey);

    Misc.setIndex(node.waiting, depId, depKey, 'resolved', true);

    self.checkResolved(myKey);
    return true;
};

Dependency.prototype.resolved = function(key, doProbe) {
    let self = this;
    let resolved = self.each(key, function(k, node) {
        if(node.known) return true;
        let isWaiting = false;
        for(let depId in node.waiting) {
            for(let depKey in node.waiting[depId]) {
                let obj = node.waiting[depId][depKey], depResolved = obj.resolved;
                if(!depResolved && doProbe) {
                    depResolved = obj.dep.resolved(depKey, true);
                }
                isWaiting = isWaiting || !depResolved;
                if(isWaiting) break;
            }
            if(isWaiting) break;
        }
        return !isWaiting;
    });
    return resolved;
};

Dependency.prototype.checkResolved = function(key, doProbe) {
    let self = this;
    if(self.active(key) && !self.propagated(key) && self.resolved(key, doProbe)) {
        //pass on the resolved key's data to any commands waiting on it
        self.fullyResolve(key);
        self.propagate(key);
        //traverse the parents of the resolved key and see if any of these are now resolved
        let parent = self.getClosestParent(key);
        if(typeof parent === 'string') self.checkResolved(parent, doProbe);
        return true;
    } else return false;
};

Dependency.prototype.getClosestParent = function(key) {
    let parent = Dependency.getParent(key);
    if(!parent) return undefined;
    while(!this.key.hasOwnProperty(parent) && parent.length > 0)
        parent = Dependency.getParent(parent);
    if(this.key.hasOwnProperty(parent)) return parent;
    return undefined;
};

Dependency.prototype.fullyResolve = function(key) {};

Dependency.prototype.propagateValues = function() {
    //sort the keys of this tree so that every child is in front of its parents
    let self = this, keys = [];
    for(let key in self.key) {
        let insert = -1;
        for(let i = 0; i < keys.length; i++) {
            if(Dependency.subkey(keys[i], key)) {
                keys.splice(i, 0, key);
                insert = i;
                break;
            }
        }
        if(insert < 0) keys.push(key);
    }
    //traverse the list, propagating any key that has a defined value and is not waiting
    keys.forEach(function(key) {
        self.checkResolved(key);
    });
};

Dependency.prototype.propagate = function(key) {
    let node = this.getKey(key);
    if(node.propagated) return false;
    for(let depId in node.trigger) {
        for(let depKey in node.trigger[depId]) {
            let dep = node.trigger[depId][depKey];
            dep.resolve(this, key, depKey);
        }
    }
    node.propagated = true;
    return true;
};

Dependency.prototype.propagated = function(key) {
    let node = this.getKey(key);
    if(node) return node.propagated || false;
    return false;
};

Dependency.prototype.setKnown = function(key, known, recursive) {
    let self = this, allKnown = true;
    self.each(key, function(k, node) {
        if(recursive || k === key || (!key && !k)) {
            node.known = known;
        }
    });
    if(known) self.checkResolved(key);
};

Dependency.prototype.collectData = function(key, obj) {
    if(obj === undefined) obj = {};
    this.each(key, function(subkey, node) {
        if(!subkey) Misc.setIndex(obj, '_value', node.value);
        else Misc.setIndex(obj, subkey.split('.'), '_value', node.value);
    });
    Misc.each(obj, function(sub, key) {
        if(key === '_value') return false;
        let done = {};
        for(let k in sub) {
            let val = sub[k];
            if(!val || typeof val !== 'object') continue;
            let keys = Object.keys(val);
            if(keys.length === 1 && keys[0] === '_value') {
                sub[k] = val._value;
                done[k] = true;
            }
        }
        return done;
    });
    return obj;
};

Dependency.prototype.addIndex = function(key) {
    let node = this.getKey(key);
    if(!node) {
        this.getKey(key, true);
        return key;
    } else {
        let newKey = '';
        for(let i = 0; this.getKey(newKey = Dependency.concatKey(key, i)); i++);
        this.getKey(newKey, true);
        return newKey;
    }
};

Dependency.prototype.clear = function(key) {
    this.each(key, function(k, node) {
        delete this.key[k];
    });
};

Dependency.prototype.toString = function(key) {
    return (key ? key + ' of ' : '') + 'DEP-' + this.id;
};

Dependency.prototype.print = function(key) {
    console.log(this.toString(key));
    let node = this.getKey(key);
    if(!node) return;
    for(let depId in node.waiting) {
        for(let depKey in node.waiting[depId]) {
            console.log(' <= ' + node.waiting[depId].dep.toString(key));
        }
    }
};


function NodeData(node) {
    Dependency.call(this);
    this.node = node;
}
NodeData.prototype = Object.create(Dependency.prototype);
NodeData.prototype.constructor = NodeData;

NodeData.prototype.setValue = function(key, value) {
    Dependency.prototype.setValue.call(this, key, value);
    if(Dependency.subkey('concept', key) !== false) {
        this.node.setEvaluated(false);
        this.node.addToEvaluateQueue();
    }
};

NodeData.prototype.fullyResolve = function(key) {
    let self = this;
    switch(key) {
        //combine all subscripts, superscripts, arguments, etc. into one MathML string
        //as the value of the 'symbol' node
        case 'symbol':
            let symbol = self.collectData(key), types = ['text', 'over', 'subscript', 'superscript', 'arguments'], text = '';
            if(symbol._value) break;
            types.forEach(function(type) {
                if(!symbol.hasOwnProperty(type)) return;
                let arr = Misc.asArray(symbol[type]), combined = '';
                arr.forEach(function(str, ind) {
                    if(str == null) str = '';
                    if(type !== 'text' && !str) return;
                    combined += str + ',';
                    let last = ind === arr.length-1;
                    if(last) combined = '<mrow>' + combined.substring(0, combined.length-1) + '</mrow>';
                    str = '<mrow>' + str + '</mrow>';
                    switch(type) {
                        case 'text':
                            text += str;
                            break;
                        case 'over':
                            text = '<mover>' + text + str + '</mover>';
                            break;
                        case 'subscript':
                            text = '<msub>' + text + str + '</msub>';
                            break;
                        case 'superscript':
                            text = '<msup>' + text + str + '</msup>';
                            break;
                        case 'arguments':
                            if(last)
                                text = '<mrow>' + text + '<mfenced>' + combined + '</mfenced></mrow>';
                            break;
                        default: break;
                    }
                });
            });
            self.setValue('symbol', text);
            break;
        default: break;
    }
};

NodeData.prototype.toString = function(key) {
    let str = key ? key + ' of ' : '';
    if(this.node) str += this.node.getId();
    return str + ' [' + this.id + ']';
};


function NodeVariables() {
    Dependency.call(this);
}
NodeVariables.prototype = Object.create(Dependency.prototype);
NodeVariables.prototype.constructor = NodeVariables;

NodeVariables.prototype.active = function(key) {
    return true;
};


function NodeDataCommand(dep, key, op, exp, rec, vari) {
    let self = this;
    Dependency.call(this);
    this.node = null;
    this.operation = op;
    this.expression = exp;
    this.recursive = rec || false;
    this.variable = vari || null;
    this.setTarget(dep, key);
}
NodeDataCommand.prototype = Object.create(Dependency.prototype);
NodeDataCommand.prototype.constructor = NodeDataCommand;

NodeDataCommand.prototype.setTarget = function(dep, key) {
    let self = this;
    self.target = dep;
    if(key !== undefined) self.editKey = key;
    if(self.target instanceof NodeData) {
        self.setNode(self.target.node);
        if(self.variable) {
            let vars = self.node.variables;
            vars.wait(self, '', self.variable, function() {
                vars.setValue(self.variable, {dep: self.target, key: self.editKey});
            });
        }
        self.wait(self.expression);
        if(self.target instanceof Dependency)
            self.target.wait(self, '', self.editKey);
        this.checkActive();
    }
};

NodeDataCommand.prototype.setNode = function(node) {
    this.node = node;
    node.addCommand(this);
};

NodeDataCommand.prototype.checkActive = function() {
    let self = this;
    if(!(this.target instanceof NodeData)) return false;
    let key = this.editKey.split('.')[0];
    if(Dependency.propagating(key)) this.activate();
};

NodeDataCommand.prototype.checkKnown = function() {
    let self = this;
    if(!(self.target instanceof NodeData)) return false;
    if(self.isAssignment()) {
        self.target.setKnown(self.editKey, true, self.recursive);
        return true;
    } else return false;
};

NodeDataCommand.prototype.isAssignment = function() {
    return this.operator === '=';
};

NodeDataCommand.prototype.resolve = function(dep, depKey, myKey) {
    let self = this;
    if(dep instanceof NodeVariables) {
        let value = dep.getValue(depKey);
        self.setTarget(value.dep, Dependency.concatKey(value.key, self.editKey));
    }
    Dependency.prototype.resolve.call(self, dep, depKey, myKey);
};

NodeDataCommand.prototype.fullyResolve = function() {

    /*
    we now have a data key, operation, and expression, where the expression value
    may have subkeys; the data key and any subkeys must be created if necessary,
    then the operation applied
    */

    let self = this, data = self.target, expression = self.expression;
    switch(self.operation) {
        case 'add':
            let keys = expression.getKeys();
            if(keys.length === 1 && keys[0] === '') {
                let key = data.addIndex(Dependency.concatKey(self.editKey, expression.getValue()));
                self.setValue('', [data, key]);
            } else {
                expression.each('', function(key, node) {
                    if(key === '') return;
                    data.setValue(Dependency.concatKey(self.editKey, key), node.value);
                });
                self.setValue('', [data, self.editKey]);
            }
            break;
        case 'addval':
            let key = data.addIndex(self.editKey);
            data.setValue(key, expression.getValue());
            break;
        case 'clear':
            data.clear(self.editKey);
            self.setValue('', [data, self.editKey]);
            break;
        default:
            self.expression.each('', function(key, node) {
                if(!self.recursive && key !== '') return;

                let nodeValue = node.value;
                if(nodeValue === undefined) return;
                else if(typeof nodeValue === 'string')
                    nodeValue = "'" + nodeValue + "'";

                let myKey = Dependency.concatKey(self.editKey, key),
                    myValue = data.getValue(myKey);
                if(myValue === undefined) {
                    if(typeof nodeValue === 'number') myValue = 0;
                    else myValue = '';
                }

                let code = 'myValue ' + self.operation + ' ' + nodeValue;
                //console.log('code for ' + self.toString());
                //console.log(code);
                eval(code);
                data.setValue(myKey, myValue);
            });
            self.setValue('', [data, self.editKey]);
            self.checkKnown();

            //if this command assigns a value rather than editing it, we should consider it final,
            //therefore inactivate all other assignment commands on this data key
            //--this should save us some circular dependencies that would never resolve
            if(self.operation === '=') {

            }
            break;
    }
};

NodeDataCommand.prototype.toString = function(key) {
    let str = key ? key + ' of ' : '';
    if(this.target instanceof Dependency && this.target.node) str += this.target.node.getId();
    if(str && this.editKey) str += '.';
    str += this.editKey + (this.recursive ? ':R' : '') + ' ' + this.operation;
    if(this.expression instanceof Expression) str += ' ' + this.expression.toString();
    return str + ' [' + this.id + ']';
}


function Expression() {
    Dependency.call(this);
    this.blocks = [];
}
Expression.prototype = Object.create(Dependency.prototype);
Expression.prototype.constructor = Expression;

Expression.fromNodeKey = function(node, key) {
    let expression = new Expression();
    expression.addReferenceBlock(node.getData(), key);
    return expression;
};

Expression.fromPair = function(e1, op, e2) {
    let expression = new Expression();
    expression.addReferenceBlock(e1);
    expression.addLiteralBlock(op);
    expression.addReferenceBlock(e2);
    return expression;
};

Expression.prototype.addLiteralBlock = function(value) {
    this.blocks.push({type: 'literal', value: value});
};

Expression.prototype.addReferenceBlock = function(dep, key, recursive) {
    this.blocks.push({type: 'reference', dep: dep, key: key, recursive: recursive});
    if(dep) this.wait(dep, key);
    return this.blocks.length-1;
};

Expression.prototype.setReference = function(blockNum, dep, key) {
    let block = this.blocks[blockNum];
    block.dep = dep;
    block.key = key;
    if(dep) this.wait(dep, key);
};

Expression.prototype.fullyResolve = function() {

    /* once all dependencies are resolved, evaluate this expression,
    matching subkeys between dependencies when possible
    */
    let self = this, expKeys = {'': true};
    //first identify all keys that are in at least one reference
    self.blocks.forEach(function(block) {
        if(block.type === 'reference' && block.recursive) {
            block.dep.each(block.key, function(key, node) {
                if(node.value != null)
                    Misc.setIndex(expKeys, key, true);
            });
        }
    });
    //for each key, if every reference has that key or an ancestor of it,
    //evaluate the expression on that key
    for(let key in expKeys) {
        let match = self.blocks.every(function(block) {
            if(block.type !== 'reference') return true;
            let parent = null;
            if(block.recursive) {
                for(let prefix = Dependency.concatKey(block.key, key);
                    !((parent = block.dep.getKey(prefix)) && (parent.value != null))
                    && prefix.length > block.key.length;
                    prefix = prefix.replace(/\.?[A-Za-z0-9]+$/, ''));
            } else {
                parent = block.dep.getKey(block.key);
            }
            if(parent && (parent.value != null)) {
                block.value = parent.value;
                return true;
            } else return false;
        });
        if(match) {
            let node = self.getKey(key, true), code = '';
            self.blocks.every(function(block) {
                let val = block.value;
                if(self.blocks.length === 1 && typeof val === 'object') {
                    code = val;
                    return false;
                } else if(block.type === 'reference' && typeof val === 'string') {
                    val = "'" + val + "'";
                }
                code += '' + val;
                return true;
            });
            //console.log('code for ' + self.toString(key));
            //console.log(code);
            node.value = typeof code === 'string' ? eval(code) : code;
        }
    }
};

Expression.prototype.toString = function(key) {
    let str = key ? key + ' of ' : '';
    this.blocks.forEach(function(block) {
        switch(block.type) {
            case 'literal': str += block.value; break;
            case 'reference':
                let substr = '';
                if(block.dep instanceof Dependency) substr += block.dep.toString();
                if(substr && block.key) substr += '.';
                substr += block.key || '';
                if(block.recursive) substr += ':R';
                str += substr;
                break;
            default: break;
        }
    });
    return str + ' [' + this.id + ']';
};










