/*

A node can store various types of data: value, visual, symbol.  All data is stored in
a single JavaScript object, where each type is under its corresponding key and is further
specified by subkeys.

Additionally, a concept stores rules on how data flows through it.  For example,
an 'equal' node passes value data from its reference to its head.  An 'augment' node
adds the value of its reference to that of its head.  A 'product' node sets its own
value to the product of its head and reference values.

The parsing of data-flow rules is hard-coded.  A concept's rules consist of a set of
one-line commands, where each command specifies:

    a) the node and the data subkey to be edited by this command.  The node is specified by a
    chain of letters, where 'S' stands for the current node, 'A' stands for its head, 'B' for its
    reference, and 'C' for all of its children.  This node specifier is followed by a chain of key
    names identifying the data key to be updated.
        So, for example, 'C.visual.origin' means we are editing the visual origin subkeys of
    all children this node, while 'A.B.value' is the value key of the reference of the head of this node.
        If no node is specified, the default is 'S', ie. this node.  Also, if the specified key isn't in
    that node's data tree yet, it is added.

    b) an operation to be performed on that node.  Certain special operations are recognized, such as 'add'
    which adds a new subkey to the specified key, or 'clear' which deletes all its subkeys.  Otherwise
    the operation can be a normal javascript assignment operator, such as =, +=, *=, etc.

    c) an expression to be passed to the operation.  This can contain references to subkeys of other
    nodes, in the same format as part (a).

    As an example, the 'equal' concept has a command of 'A.value = B.value', ie. it assigns the value
    key of its reference (and its entire subtree) to that of its head.


More Examples:

    Visual:
    'body' - visual.shape.circle.radius = 30
            C.symbol.subscript add A.symbol + B.symbol

    'box' - visual.shape clear
            visual.shape.square.width = 30
                -overrides the default shape provided by 'body' using the clear() function

    'vector' - visual.shape.line
            symbol.over = &rharu;

    'component' - A.visual.shape.line.delta += S.value * B.visual.delta

        In this 'component' example, A would be a vector and B a direction.  The 'delta' key
        stores a pixel difference and has keys 'x' and 'y'.  So this command looks for keys
        'x' and 'y' under any key on the right-hand side, which it finds in B.visual.delta
        (which represents the pixel delta of the direction's unit vector) and applies the 'x'
        of the latter to the 'x' of the former etc.

    'sum' - value = A + B
            symbol = A + B

Visual data will vary widely. Often the first-level keys will be shapes: line, triangle,
arc, circle, rectangle, etc.  Each of these needs a sufficient set of subkeys to specify
how it is to be drawn.  A line, for instance, could be determined by a start pixel coupled
with either an end pixel, a pixel difference, or a length and direction.

Any reference in a command to another node's data key is linked as a dependency.
When that key is resolved, its value, which will itself be a tree (a subtree of the dependent node's
data tree) will be passed back.  We have to somehow take all the dependent subtrees in a command
and combine them per the command operations.

In any part of a command that doesn't contain special operators, the only way to combine these
subtrees is if they have the same key structure.  For example, if there were a command

    visual.delta += A.visual.delta + B.visual.delta,

and A and B's 'visual.delta' subtrees had 'x' and 'y' subkeys with numerical values, this would resolve to

    visual.delta.x += A.visual.delta.x + B.visual.delta.x
    visual.delta.y += A.visual.delta.y + B.visual.delta.y

The data tree of a node can also be included directly in a relation, as child nodes of that node which
have no reference link.

*/


Node.prototype.initData = function(type) {
    let self = this, data = self.data;
    data[type] = {};
    switch(type) {
        case 'concept':
            self.setData('concept.' + self.concept, self.getConcept());
            break;
        case 'symbol':
            self.setData('symbol.text', self.name);
            break;
        case 'value':
            let value = self.getValue();
            if(value) self.setData('value', value);
            break;
    }
};

Node.prototype.setupDataDependencies = function(type) {

    let self = this, concept = self.getConcept(), commandStrings = concept.getCommands(type);

    commandStrings.forEach(function(commandStr) {

        let tokens = commandStr.split(/\s+/), tgt = tokens.shift(), op = tokens.shift(),
            exp = tokens.join(' '), context = false;

        let tgtRef = self.parseReferences(tgt)[0];
        if(!tgtRef || tgtRef[0].start > 0 || tgtRef[0].end < tgt.length) return;

        if(tgtRef.type === 'var') {
            let command = new NodeDataCommand(tgtRef.var, tgtRef.key, op);
            command.wait(self.variables, tgtRef.var, function(ret) {
                command.edit = ret.value;
            });
            commands.push(command);
        } else if(tgtRef.type === 'node') {
            tgtRef.nodes.forEach(function(node) {
                commands.push(new NodeDataCommand(node.getData(), tgtRef.key, op));
            });
        }

        let expression = null;
        commands.forEach(function(command) {
            if(!expression || tgtRef.nodeAsContext) {
                let node = tgtRef.nodeAsContext ? command.edit.node : self;
                expression = new Expression(null);
                let refs = node.parseReferences(exp), ind = 0;
                refs.forEach(function(ref) {
                    if(ref.start > ind)
                        expression.addLiteralBlock(exp.substring(ind, ref.start));
                    let refNum = expression.addReferenceBlock();
                    ind = ref.end;
                    if(ref.type === 'var') {
                        expression.wait(self.variables, ref.var, function(ret) {
                            expression.wait(ret.value, ref.key, function(ret) {
                                expression.setReference(refNum, ret);
                            });
                        });
                    } else if(ref.type === 'node') {
                        expression.wait(ref.nodes[0].getData(), ref.key, function(ret) {
                            expression.setReference(refNum, ret);
                        });
                    }
                });
            }
            command.expression = expression;
            command.init();
        });
    });
};

Node.prototype.parseReferences = function(str) {
    let self = this,
        re = /[^A-Za-z0-9'"](\$[A-Za-z0-9]+|[A-Z](?:\.[A-Z])*)((?:\.[A-Za-z0-9]+)*)[^A-Za-z0-9'"]/,
        references = [];
    while((match = re.exec(str)) !== null) {
        let ref = {key: match[2], start: match.index, end: re.lastIndex}, data = match[1];
        if(data[0] === '$') {
            ref.type = 'var';
            ref.var = data.substring(1);
        } else {
            if(data[data.length-1] === ':') {
                ref.nodeAsContext = true;
                data = data.substring(0, data.length-1);
            }
            ref.type = 'node';
            ref.nodes = self.getConnectedNodes(data);
        }
        references.push(ref);
    }
    return references;
};

//generate a syntax tree from a node data command
Node.prototype.splitDataCommand = function(command) {
    /* TODO */
};

Node.prototype.getData = function(key, create) {
    return this.data.getNode(key, create);
};

Node.prototype.setData = function(key, value) {
    this.data.insert(key, value);
};

//data may be stored in the data tree/command set, or as child nodes;
//this function merges all child nodes into the tree/command format
//so they can all be evaluated together
Node.prototype.collectData = function(key) {
    let obj = {}, data = this.getData(key);
    if(!data) return obj;
    data.eachChild(function(child) {
        child.collectData(obj);
    });
    return obj;
};


function Dependency(parent, key, value) {
    this.id = Dependency.nextId++;
    this.key = {};
    this.value = {};
    this.waiting = {};
    this.triggers = {};
    this.active = {};
}
Dependency.nextId = 0;
Dependency.propagate = {};

Dependency.propagate = function(type) {
    if(!type) {
        for(let key in Dependency.propagate)
            delete Dependency.propagate[key];
    } else Dependency.propagate[type] = true;
};

Dependency.setPropagate = function(type) {
    Dependency.propagate(null);
    Dependency.propagate(type);
};

Dependency.propagating = function(type) {
    if(Dependency.propagate['ALL']) return true;
    return Dependency.propagate[type] ? true : false;
};

Dependency.inSubtree = function(subkey, key) {
    let len = subkey.length;
    return key.indexOf(subkey) === 0 && (key.length === len || key[len] === '.');
};

Dependency.concatKey = function(key1, key2) {
    let key = key1 || '';
    if(key1 && key2) key += '.';
    key += key2 || '';
    return key;
};

Dependency.prototype.getId = function() {
    return this.id;
};

Dependency.prototype.getKey = function(key, create) {
    let node = this.key[key || ''];
    if(create && !node) node = this.key[key || ''] = {};
    return node;
};

Dependency.prototype.each = function(key, callback) {
    for(let k in this.key) {
        if(Dependency.inSubtree(k, key)) callback.call(this, k, this.getValue(k));
    }
};

Dependency.prototype.getValue = function(key) {
    let node = this.getKey(key);
    if(node) return node.value || undefined;
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

Dependency.prototype.activate = function(key) {
    let node = this.getKey(key);
    if(!node) return;
    node.active = true;

    if(this.checkResolved(key)) return;

    for(let depId in node.waiting) {
        for(let depKey in node.waiting[id]) {
            let obj = node.waiting[depId][depKey], dep = obj.dep;
            if(dep) dep.activate(depKey);
        }
    }
};

Dependency.prototype.wait = function(dep, depKey, myKey, callback) {
    let node = this.getKey(myKey, true);
    Misc.setIndex(node.waiting, dep.getId(), depKey, {
        dep: dep,
        callback: callback
    });
    dep.addTrigger(this, depKey, myKey);
};

Dependency.prototype.addTrigger = function(dep, key, depKey) {
    let node = this.getKey(key, true);
    Misc.setIndex(node.triggers, dep.getId(), depKey, dep);
};

Dependency.prototype.resolve = function(dep, depKey, myKey) {
    let depId = dep.getId(), obj = Misc.getIndex(this.waiting, myKey, depId, depKey);
    if(!obj) return;

    let callback = obj.callback;
    if(typeof callback === 'function') callback.call(this, dep, depKey, myKey);

    Misc.deleteIndex(this.waiting, myKey, depId, depKey);

    this.checkResolved();
};

Dependency.prototype.resolved = function(key) {
    return Object.keys(waiting).length === 0;
};

Dependency.prototype.fullyResolve = function(key) {};

Dependency.prototype.propagate = function(key) {
    for(let depId in this.trigger[key]) {
        for(let depKey in this.trigger[key][depId]) {
            let dep = this.triggers[key][id];
            dep.resolve(this, key, depKey);
        }
    }
};

Dependency.prototype.checkResolved = function(key) {
    if(!this.active(key)) return false;
    for(let k in this.waiting) {
        if(Dependency.inSubtree(k, key)) return false;
    }
    this.fullyResolve(key);
    this.propagate(key);
    return true;
};

Dependency.prototype.collectData = function(key, obj) {
    for(let k in this.value) {
        if(Dependency.inSubtree(k, key)) {
            Misc.setIndex(obj, k.split('.'), '_value', this.getValue(k));
        }
    }
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


function NodeData(node) {
    Dependency.call(this);
    this.node = node;
}
NodeData.prototype = Object.create(Dependency.prototype);
NodeData.prototype.constructor = NodeData;


function NodeDataCommand(dep, key, op, exp) {
    Dependency.call(this);
    this.operation = op;
    this.expression = exp;
    this.setTarget(dep, key);
}
NodeDataCommand.prototype = Object.create(Dependency.prototype);
NodeDataCommand.prototype.constructor = NodeDataCommand;

NodeDataCommand.prototype.init = function() {
    //the data key being edited by this command can't be resolved until the command completes
    let self = this;
    self.expression.init();
    self.wait(self.expression);
    self.target.wait(self, null, self.editKey);
};

NodeDataCommand.prototype.setTarget = function(dep, key) {
    this.target = dep;
    if(key !== undefined) this.editKey = key;
    this.checkActive();
};

NodeDataCommand.prototype.checkActive = function() {
    let self = this;
    if(typeof this.target !== 'object') return false;
    if(!this.target.prototype.isPrototypeOf(NodeData)) return false;
    let key = this.editKey.split('.')[0];
    if(Dependency.propagating(key)) this.activate();
};

NodeDataCommand.prototype.fullyResolve = function() {

    /*
    we now have a data key, operation, and expression, where the expression value
    may have subkeys; the data key and any subkeys must be created if necessary,
    then the operation applied
    */

    let self = this, data = self.target;
    switch(self.operation) {
        case 'add':
            if(typeof expression.value === 'string') {
                let key = data.addIndex(data.concatKey(self.editKey, expression.value));
                self.value = [data, key];
            } else {
                self.expression.each('', function(key, value) {
                    data.setValue(data.concatKey(self.editKey, key), value);
                });
                self.value = [data, self.editKey];
            }
            break;
        case 'clear':
            data.clear(self.editKey);
            self.value = [data, self.editKey];
            break;
        default:
            self.expression.each('', function(key, value) {
                let myKey = data.concatKey(self.editKey, key),
                    myValue = data.getValue(myKey);
                eval('newValue ' + self.operation + ' ' + value);
                data.setValue(myKey, myValue);
            });
            self.value = [data, self.editKey];
            break;
    }
};


function Expression() {
    Dependency.call(this);
    this.references = [];
    this.blocks = [];
}
Expression.prototype = Object.create(Dependency.prototype);
Expression.prototype.constructor = Expression;

Expression.fromNodeKey = function(node, key) {
    let expression = new Expression(null), data = node.getData();
    let refNum = expression.addReferenceBlock();
    expression.wait(data, key, function(ret) {
        expression.setReference(refNum, ret);
    });
    return expression;
};

Expression.fromPair = function(e1, op, e2) {
    let expression = new Expression(null);
    expression.addReferenceBlock();
    expression.addReferenceBlock();
    expression.wait(e1);
    expression.wait(e2);
    expression.setReference(0, e1);
    expression.setReference(1, e2);
    return expression;
};

Expression.prototype.addLiteralBlock = function(value) {
    this.blocks.push(value);
};

Expression.prototype.addReferenceBlock = function() {
    this.references.push(null);
    let refNum = this.references.length - 1;
    this.blocks.push({type: 'reference', index: refNum});
    return refNum;
};

Expression.prototype.setReference = function(index, value) {
    this.references[index] = value;
};

Expression.prototype.init = function() {
};

Expression.prototype.fullyResolve = function() {

    /* once all dependencies are resolved, evaluate this expression,
    matching subkeys between dependencies when possible
    */
    let self = this, keys = {};
    self.references.forEach(function(ref, index) {
        ref.eachKey(function(key, node) {
            if(node.value) Misc.setIndex(keys, key, index, true);
        });
    });
    for(let key in keys) {
        let refKey = {};
        let match = self.references.every(function(ref, index) {
            let prefix = key;
            for(;
                !((prefixNode = ref.getNode(prefix)) && prefixNode.value) && prefix.length > 0;
                prefix = prefix.replace(/\.?[A-Za-z0-9]+$/, ''));
            if(prefixNode.value) {
                refKey[index] = prefixNode;
                return true;
            } else return false;
        });
        if(match) {
            let data = self.getNode(key, true), str = '';
            let built = self.blocks.every(function(block) {
                if(typeof block === 'object') {
                    if(block.type !== 'reference' && block.index) {
                        let refNode = refKey[block.index];
                        if(!refNode) return false;
                        str += '' + refNode.getValue();
                    } else return false;
                } else {
                    str += '' + block;
                }
            });
            if(built) data.value = eval(str);
        }
    }
};










