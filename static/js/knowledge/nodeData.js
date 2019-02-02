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
            self.setData('concept.' + self.concept, true);
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

    let self = this, concept = self.getConcept(), commands = concept.getCommands(type);

    commands.forEach(function(commandStr) {

        let tokens = commandStr.split(' '), targetStr = tokens.shift(), op = tokens.shift();
        if(!self.isDataKey(targetStr)) return;
        let parse = self.parseDataKey(targetStr), targets = parse.nodes, targetKey = parse.key;
        let expression = new Expression(tokens, self);

        targets.forEach(function(target) {
            let command = new NodeDataCommand(target, targetKey, op, expression);
        });
    });
};

Node.prototype.isDataKey = function(token) {
    let oneWord = token.match(/^[0-9A-Za-z]$/);
    if(oneWord) return NodeData.types.indexOf(token) >= 0;
    return token.match(/^[0-9A-Za-z\.]+$/) !== null;
};

Node.prototype.parseDataKey = function(str) {
    let self = this, parts = str.split('.'), nodeNames = ['S', 'A', 'B', 'C'], splitPos = 0;
    for(let i = 0; i < parts.length; i++) {
        if(nodeNames.indexOf(parts[i]) >= 0) splitPos += parts[i].length + 1;
        else break;
    }
    let nodes = str.substring(0, Math.max(splitPos-1, 0)), dataKey = str.substring(splitPos);
    return {nodes: self.getConnectedNodes(nodes || 'S'), key: dataKey};
};

//generate a syntax tree from a node data command
Node.prototype.splitDataCommand = function(command) {
    /* TODO */
};

Node.prototype.addDataCommand = function(command) {
    let dep = new NodeDataCommand(this, command);
    dep.init();
};

Node.prototype.getData = function(key, create) {
    return this.data.getKey(key, create);
};

Node.prototype.setData = function(key, value) {
    this.data.insert(key, value);
};

//data may be stored in the data tree/command set, or as child nodes;
//this function merges all child nodes into the tree/command format
//so they can all be evaluated together
Node.prototype.collectData = function(rootNode) {
    let self = this, dataConcept = self.relation.getSpecialConcept('data'),
        children = self.getChildrenByConcept(dataConcept);
    if(rootNode === undefined) rootNode = self;
    children.forEach(function(child) {
        child.collectData(rootNode);
    });
};


function Dependency() {
    this.key = null;
    this.value = null;
    this.parent = null;
    this.children = {};
    this.waiting = {};
    this.triggers = {};
}

Dependency.prototype.insert = function(key, value) {
    self.getKey(key, true).setValue(value);
};

Dependency.prototype.getKey = function(key, create) {
    let self = this;
    if(typeof key !== 'object') key = key.split('.');

    if(key.length === 0) return self;

    let firstKey = key.shift();
    let child = self.getChild(firstKey, create);
    if(!child) return null;
    return child.getKey(key, create);
};

Dependency.prototype.getChild = function(key, create) {
    let self = this;
    if(!self.children.hasOwnProperty(key)) {
        if(!create) return null;
        self.children[key] = new NodeData(self.node);
    }
    return self.children[key];
};

Dependency.prototype.getValue = function() {
    return this.value;
};

Dependency.prototype.setValue = function(value) {
    this.value = value === undefined ? null : value;
};

Dependency.prototype.getKeyString = function() {
    let parentStr = this.parent ? this.parent.getKeyString() + '.' : '';
    return parentStr + this.key;
};

Dependency.prototype.getDependencyId = function() {
    return undefined;
};

Dependency.prototype.getDependencyKey = function() {
    return undefined;
};

Dependency.prototype.wait = function(dep, key) {
    Misc.setIndex(this.waiting, dep.getDependencyId(), key, true);
    dep.addTrigger(this, key);
};

Dependency.prototype.addTrigger = function(dep, key) {
    Misc.setIndex(this.triggers, dep.getDependencyId(), key, dep);
};

Dependency.prototype.resolve = function(dep, key) {
    Misc.deleteIndex(this.waiting, dep.getId());
    if(Object.keys(waiting).length === 0) {
        for(let id in this.triggers) {
            let dep = this.triggers[id];
            if(typeof dep === 'object' && dep.prototype.isPrototypeOf(Dependency))
                dep.resolve(this, this.getDependencyKey());
        }
    }
};


function NodeData(node) {
    this.node = node;
    this.key = key;
    this.parent = null;
    this.children = {};
    this.value = null;
}
NodeData.prototype = Object.create(Dependency.prototype);
NodeData.constructor = NodeData;

NodeData.prototype.getDependencyId = function() {
    return this.node.getId();
};

NodeData.prototype.getDependencyKey = function() {
    return this.getKeyString();
};

NodeData.prototype.getReferenceString = function() {
    return this.node.getId() + '.' + this.getKeyString();
};

NodeData.prototype.resolve = function(command, key) {
    let self = this, data = self.getKey(key, true);
    data.applyOperation()
};


function NodeDataCommand(command) {
    this.node = node;
    this.command = command;
    this.originalCommand = command;
    this.editKey = null;
    this.operation = null;
    this.values = {'sub': {}, 'all': {}};
    this.expressionTree = null;
}
NodeDataCommand.prototype = Object.create(Dependency.prototype);
NodeDataCommand.constructor = NodeDataCommand;

NodeDataCommand.prototype.parse = function() {
    let self = this, tokens = this.command.split(/\s+/), sources = [];
    self.editKey = tokens.shift();
    self.operation = tokens.shift();
    self.expression = new Expression(tokens.join(' '));
};

NodeDataCommand.prototype.setup = function() {
    //the data key being edited by this command can't be resolved until the command completes
    self.node.getData().wait(self, self.editKey);
    self.expression.setup();
};

NodeDataCommand.prototype.resolve = function(expression) {

    /*
    we now have a data key, operation, and expression, where the expression value
    may have subkeys; the data key and any subkeys must be created if necessary,
    then the operation applied
    */

    let self = this, data = self.node.getKey(self.editKey, true);
    switch(self.operation) {
        case 'add':
            break;
        case 'clear':
            break;
        default:
            self.expression.eachNode(function(node) {
                let subData = data.getKey(node.getKey(), true);
                eval('subData.value ' + self.operation + ' ' + self.expression.)
            });
            break;
    }

    Dependency.prototype.resolve.call(this, expression);
};

NodeDataCommand.prototype.resolveCommand = function() {
    for(let k in this.values.sub) this.resolveTree(this.expressionTree, k);
    this.resolveTree(this.expressionTree, null);
};

NodeDataCommand.prototype.resolveCommandHelper = function(index) {

    let self = this, key = self.editKey;
    if(index) key += '.' + index;
    let args = key.split('.');
    args.unshift(self.node.data);
    let editKey = Misc.getOrCreateIndex.apply(Misc, args);

    let expression = self.resolveTree(self.tree, index);
    switch(self.operation) {
        case 'add': //specify an index to add to a data key
            editKey[expression] = {};
            break;
        case 'clear': //empty out the given data key
            for(let k in editKey) delete editKey[k];
            break;
        default:
            eval('self.data.' + key + ' ' + self.operation + ' ' + expression);
            break;
    }
};


function Expression(exp, node) {
    this.node = node || null;
    this.parent = null;
    this.children = [];
    this.waiting = {};

    if(Array.isArray(exp)) {
        this.expression = exp.join(' ');
        let self = this;
        tokens.forEach(function(token) {
            if(self.node.isDataKey(token)) {
                let parse = self.node.parseDataKey(token);
                self.wait(parse.nodes[0], parse.key);
            }
        });
    } else this.expression = exp;
}
Expression.prototype = Object.create(Dependency.prototype);
Expression.constructor = Expression;

Expression.prototype.addArgument = function(exp) {
    let child = new Expression(exp);
    this.children.push(child);
    child.setParent(this);
};

Expression.prototype.setParent = function(exp) {
    this.parent = exp;
};

Expression.prototype.setup = function() {
    let self = this, tokens = self.split(/\s+/);
    //this expression has to wait for all dependent keys to be resolved
    for(let i = 2; i < tokens.length; i++) {
        if(self.node.isDataKey(tokens[i])) sources.push(self.node.parseDataKey(tokens[i]));
    }
    sources.forEach(function(source) {
        self.wait(source.nodes[0], source.key);
    });
};

Expression.prototype.wait = function(node, key) {
    Dependency.prototype.wait.call(this, node.getData(), key);
};

Expression.prototype.resolve = function(data, key) {
    let refStr = data.getReferenceString();
    this.expression.replace(refStr, data.getValue());

    /* once all dependencies are resolved, evaluate this expression;
    matching subkeys between the two arguments are paired
    */

    if(this.resolved()) {

        this.value = eval(this.expression);
    }
    switch(typeof this.expression) {
        case 'string':
            if(args.length === 2) {
                let resolvedArgs = [];
                this.arguments.forEach(function(arg) {
                    resolvedArgs.push(arg.resolve());
                });
                return eval(resolvedArgs[0] + ' ' + this.expression + ' ' + resolvedArgs[1]);
            } else {
                let str = this.expression;
                for(let key in this.dependencies) {
                    str = str.replace(key, this.dependencies[key].getValue());
                }
                return eval(str);
            }
            break;
        case 'object':
            return expression.getValue();
            break;
        default: return null;
    }
};
