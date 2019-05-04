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
to say the command should be executed on all subkeys of the specified key.

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

Finally, there is a small prototype called NodeVariables, also a Dependency.  Every node stores a NodeVariables tree.
A command can store the data key it is modifying in a variable, and that variable can be referenced by another command
in the same node.  For example, you could have these 3 commands:

    A.visual.origin>P clear
    $P.x = 100
    $P.y = -250

The first one deletes all subkeys of the 'visual.origin' key of the head node (see implementation of 'clear' in
NodeDataCommand.prototype.fullyResolve below).  Once the first command finishes, the 'P' variable now points to
'A.visual.origin', so the second command becomes 'A.visual.origin.x = 100', and the third 'A.visual.origin.y = -250'.
Note that it doesn't matter if you list these commands out of order, because the second and third will still wait for the
'P' variable to resolve, which only happens when the first command finishes.  That works because all commands are checked
to see which ones are ready to resolve, and when they resolve their values propagate to all waiting commands, and so on.
This process is kicked off from Law.prototype.resolveData in databaseWrappers.js.

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

        // the target may reference a temporary variable in this node, instead of specific node data;
        // another command may point that variable to node data, thus finally resolving this command
        if(tgtRef.type === 'var') {
            // find all node/data references in the expression
            let expression = self.parseExpression(exp);
            // since the target is a variable, we specify the data parameter as null, using the 'variable' parameter instead;
            // once the variable is pointed to node data by another command, this command will update its target to be that data
            let command = new NodeDataCommand(null, tgtRef.key, op, expression, tgtRef.recursive, tgtRef.variable);
            // hence this command has to wait for the variable to be resolved (pointed to node data) so it knows what to modify
            command.wait(self.variables, tgtRef.var);
        // normally the target will be a node, not a variable
        } else if(tgtRef.type === 'node') {
            // if the references in the expression are relative to this node (default), we can parse them immediately
            let expression = null;
            if(!tgtRef.nodeAsContext) expression = self.parseExpression(exp);
            // the command must be executed on each target node (eg. if the target is 'C' meaning all children of this node,
            // then it must execute on each child)
            self.getConnectedNodes(tgtRef.nodes, function(node) {
                // if the references are relative to the target node(s), we parse them separately for each target node
                if(tgtRef.nodeAsContext) expression = node.parseExpression(exp);
                // create a command to update the specified target node's data key via the operation and expression
                let command = new NodeDataCommand(node.getData(), tgtRef.key, op, expression, tgtRef.recursive, tgtRef.variable);
                // optionally probe the data referenced by this command to see if it's already resolved, and if so resolve the command
                if(doCheck) {
                    command.checkResolved('', true);
                }
            });
        }
    });
};

// parse all references in the expression part of a command, creating an Expression object (defined below) to hold them
Node.prototype.parseExpression = function(str) {
    let self = this, expression = new Expression();
    // parse each node data or variable reference
    let refs = self.parseReferences(str);

    // no we split the expression into blocks representing the references and the text in between them,
    // which is treated as raw JavaScript; see the Expression prototype at the bottom of this file

    // start an index at the beginning of the expression string and loop through all references we found
    ind = 0;
    refs.forEach(function(ref) {

        // if the next reference is beyond the last index we checked, there is raw JavaScript in between (a 'literal')
        if(ref.start > ind)
            expression.addLiteralBlock(str.substring(ind, ref.start));

        // otherwise, we add a block for the next reference, which refers to either a temporary variable or some node data
        if(ref.type === 'var') {
            // if it's a variable, we add a block whose data/key are empty until we find out data the variable points to
            let blockNum = expression.addReferenceBlock(null, null, ref.recursive);
            // then we wait for that variable to be resolved
            expression.wait(self.variables, ref.var, '', function(vars, varName) {
                let value = vars.getValue(varName);
                // and once it is, we set this block to refer to the same data/key as the variable does, except the key
                // is extended by the key of this reference; for example, if the reference is '$C.origin', and the 'C'
                // variable is set to 'B.visual' by another command, this reference will then be 'B.visual.origin'
                expression.setReference(blockNum, value.dep, Dependency.concatKey(value.key, ref.key));
            });
        } else if(ref.type === 'node') {
            // if it's a node, create the block for the node and its given data key
            // it should point to a single node since we can't resolve multiple values in a single reference;
            // so if there are multiple, we just get the first one
            let refNode = self.getConnectedNodes(ref.nodes)[0];
            if(refNode) {
                expression.addReferenceBlock(refNode.getData(), ref.key, ref.recursive);
            }
        }
        ind = ref.end;
    });
    // if there is any leftover text after the last reference, it is another literal block
    if(ind < str.length) expression.addLiteralBlock(str.substring(ind));
    return expression;
};

// here we define the regular expression (code which matches a pattern in a string) which
// matches either a node or variable reference
// This function is called once in knowledge.html to initialize the RegExp object, which is then
// reused every time we parse a command
function refRegex() {

    // matches an arbitrary length alphanumeric sequence beginning with a letter;
    // every variable name or data key must be of this form
    let alphaNum = '[A-Za-z][A-Za-z0-9]*',

    // matches a relative node identifier for self/head/reference/children (see explanation at top of this file)
    // plus an optional concept name in parentheses to filter results, which may have a '!' in front to exclude that concept instead
        nodeId = '(?:A|B|C|S)(?:\\(!?' + alphaNum + '\\))?',

    // same as above but captures the concept name and exclude flag
        nodeIdCapture = '(A|B|C|S)(?:\\((!?)(' + alphaNum + ')\\))?',

    // matches an arbitrary number of node letter/concept name sequences as above, strung together with '.'
        nodeChain = nodeId + '(?:\\.' + nodeId + ')*';


    // using the above pieces, we build the pattern that will match any reference

    // first character: reference should be proceeded by a non-alphanumeric character unless it's at the start of the expression
    let mainStr = '(^|[^A-Za-z0-9])'

    // we start with either the variable (indicated by a $ prefix) or node
        + '(\\$' + alphaNum + '|' + nodeChain + ')(:?)'

    // then the sub-key of that variable/node
        + '((?:\\.[A-Za-z0-9]+)*)'

    // optional sequences after the key
    //  ':R' to operate recursively on any subkeys of the specified key,
    //  '>{var}' to place the data specified in the reference into the temporary variable 'var' of this node
        + '((?::R)?)((?:>' + alphaNum + ')?)'

    // last character: reference should again be followed by a non-alphanumeric character if it's not at the very end of the string
        + '([^A-Za-z0-9]|$)';

    return {
        main: new RegExp(mainStr, 'g'), // to parse the reference
        node: new RegExp(nodeIdCapture) // to parse the concept name/exclude flag within each node letter in the reference
    };
}

// parse all references in the given string; we do this once for the target of a command, and again for the expression
Node.prototype.parseReferences = function(str) {
    let self = this, regex = relation.regex, references = [];

    regex.main.lastIndex = 0;
    // loop through the string, finding all matches to the regular expression defined in refRegex() above
    while((match = regex.main.exec(str)) !== null) {

        // the various pieces that are captured by the regular expression represent the pieces of the reference
        let first = match[1], data = match[2], context = match[3], key = match[4],
            opts = match[5], variable = match[6], last = match[7];

        // make an object to store all the pieces
        let ref = {
            key: key || '',

            // store the position of this reference within the entire string
            start: match.index,
            end: regex.main.lastIndex,

            // applies only to the target node: indicates whether the references in the expression are relative to
            // the target node (true), or the node in which the command was compiled
            nodeAsContext: context === ':',

            // this is the variable in which to store the data referred to by this reference;
            // specified by the '>{var}' suffix on the reference (see refRegex() above)
            variable: variable.substring(1)
        };

        // if a reference string is surrounded by alphanumeric characters, you can bound it by {} to demarcate it
        let bounded = first === '{' && last === '}';
        // otherwise, the reference pattern includes the non-alphanumeric characters before and after it; remove them now
        if(first && !bounded) ref.start++;
        if(last && !bounded) ref.end--;
        // remove the '.' that separates the node/variable identifier from the key string
        if(ref.key && ref.key[0] === '.') ref.key = ref.key.substring(1);

        // now parse the node/variable identifier
        if(data[0] === '$') {
            // this is the variable that some other command must point to node data; once it does,
            // this reference will refer to that data, and can be resolved when the data is resolved
            ref.type = 'var';
            ref.var = data.substring(1);
        } else {
            ref.type = 'node';
            ref.nodes = [];
            // if node, we parse each element of the chain into its letter, and optional concept name and exclude flag
            data.split('.').forEach(function(nodeStr) {
                // this is a smaller regular expression that just parses the letter/concept/exclude flag (see refRegex())
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

        // parse any flags following the reference (prefixed with a ':')
        // - for now we only have the R flag meaning the reference includes all subkeys of its specified key
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

// once a command is compiled, store it in this node, indexed by its ID
Node.prototype.addCommand = function(command) {
    this.commands[command.getId()] = command;
};

// loop through each command of this node and probe the data it references to see if it is resolved yet;
// if so, we can resolve the command
Node.prototype.checkCommands = function() {
    for(let cid in this.commands) {
        let command = this.commands[cid];
        command.checkResolved('', true);
    }
};

// set each command as inactive and unresolved; for example, if we update the text of a command in the interface,
// we will want to re-compile and re-resolve it to see its new effect
Node.prototype.resetCommands = function() {
    for(let id in this.commands) {
        this.commands[id].reset();
    }
};

// for debugging, print a list of the commands on this node
Node.prototype.printCommands = function() {
    for(let id in this.commands) {
        console.log(this.commands[id].toString());
    }
};

//generate a syntax tree from the expression of a command
// - we would only need this if we don't want to treat the text between references as pure JavaScript
Node.prototype.splitExpression = function(exp) {
    /* TODO */
};


// set the value of a key of this node's data tree
Node.prototype.setData = function(key, value) {
    this.data.setValue(key, value);
};

// collect the specified data key and all its subkeys into an object with their values
Node.prototype.collectData = function(key) {
    return this.getData().collectData(key);
};

// for debugging, print all keys of this node's data tree
Node.prototype.printData = function(key) {
    this.getData().each(key, function(k, node) {
        let str = '' + k + ': ' + node.value;
        if(node.active) str += '\tactive';
        if(node.propagated) str += '\tpropagated';
        console.log(str);
    });
};

// set the value of a temporary variable in this node
// - for variables, the key is the same as the variable name
Node.prototype.setVariable = function(key, value) {
    this.variables.setValue(key, value);
};

// get the value of a temporary variable in this node
Node.prototype.getVariable = function(key) {
    return this.variables.getValue(key);
};


/*
Dependency:
The parent class of node data trees, commands, expressions, and variables.
A Dependency is a tree where each node has a name (key) and value.  The key is a string,
while the value could be anything.  A key is indexed by its path from the root of the tree.
For example, if there is a 'visual' key under the root, and an 'origin' key under that,
and an 'x' key under that, the latter is indexed as 'visual.origin.x'.

The root key is represented by the empty string ''.

A key from one dependency can wait on a key from another; that creates a trigger from the
second dependency to the first.  When the specified key of the second resolves, it will
notify the first, which can then use its value.  This way, a key of a node's data waits for
all commands that modify it to resolve, while a command waits for its expression to resolve,
and an expression waits for all data that it references to resolve.  Once the data resolves,
it in turn notifies the commands that are waiting on it, and the cycle continues.  This creates a chain
reaction that ultimately causes all known data to propagate through the law's tree, filling
in the information needed to visualize and symbolize nodes.

Keys are stored as objects - for details, see Dependency.prototype.getKey below
*/

function Dependency() {
    // index each instance into a global list for debugging purposes
    this.id = Dependency.prototype.nextId++;
    Dependency.prototype.instance[this.id] = this;

    // the 'tree' of this dependency, indexed by full key string
    this.key = {};
}

/*
    Static members and functions
*/
Dependency.prototype.nextId = 0;
Dependency.prototype.instance = {};
Dependency.prototype.propagateKey = {};

// mark a certain type of node data as being propagated, eg. if we only want to do visualization or symbolization but not both
Dependency.propagate = function(type) {
    if(!type) {
        for(let key in Dependency.prototype.propagateKey)
            delete Dependency.prototype.propagateKey[key];
    } else Dependency.prototype.propagateKey[type] = true;
};

// clear the list of types we are propagating and set it to the specified type
Dependency.setPropagating = function(type) {
    Dependency.propagate(null);
    Dependency.propagate(type);
};

// whether we are currently propagating the specified data type
Dependency.propagating = function(type) {
    if(Dependency.prototype.propagateKey['']) return true;
    if(type === 'concept') return true;
    return Dependency.prototype.propagateKey[type] ? true : false;
};

// make sure every key we create or reference is a string (empty string is okay, but no null values)
Dependency.cleanKey = function(key) {
    return key == null ? '' : '' + key;
};

// check whether 'subkey' is a subkey of 'key'; for example 'symbol.subscript' is a subkey of 'symbol',
// but it is not a subkey of 'symbol.superscript'
Dependency.subkey = function(key, subkey) {
    key = Dependency.cleanKey(key);
    subkey = Dependency.cleanKey(subkey);
    if(subkey.length < key.length) return false;
    if(!key) return subkey;
    if(subkey === key) return '';
    if(subkey.indexOf(key) !== 0 || subkey[key.length] !== '.') return false;
    return subkey.substring(key.length+1);
};

// check whether 'subkey' is a direct child of 'key'
Dependency.isChild = function(key, subkey) {
    subkey = Dependency.cleanKey(subkey);
    key = Dependency.cleanKey(key);
    if(!key) return subkey.match(/^[A-Za-z0-9]+$/) ? true : false;
    let len = key.length;
    return subkey.indexOf(key) === 0 &&
        subkey.substring(len).match(/^\.[A-Za-z0-9]+$/) ? true : false;
};

// concatenate two keys into one; for example, 'visual.shape' + 'line.delta' = 'visual.shape.line.delta'
Dependency.concatKey = function(key1, key2) {
    key1 = Dependency.cleanKey(key1);
    key2 = Dependency.cleanKey(key2);
    let key = key1;
    if(key && key2) key += '.';
    key += key2;
    return key;
};

// get the parent key of the specified key, if it is not already the root key
Dependency.getParent = function(key) {
    key = Dependency.cleanKey(key);
    if(!key) return undefined;
    return key.replace(/\.?[A-Za-z0-9]+$/, '');
};

// any keys in any dependencies that are not waiting on anything are resolved and
// passed on to anything that is waiting on them
Dependency.propagateValues = function() {
    for(let id in Dependency.prototype.instance) {
        let dep = Dependency.prototype.instance[id];
        dep.propagateValues();
    }
};

// delete all commands along with their expressions
Dependency.clearCommands = function() {
    for(let id in Dependency.prototype.instance) {
        let dep = Dependency.prototype.instance[id];
        if(!(dep instanceof NodeData) && !(dep instanceof NodeVariables)) {
            dep.each('', function(key, node) {
                for(let depId in node.waiting) delete node.waiting[depId];
                for(let depId in node.trigger) delete node.trigger[depId];
            });
            console.log('deleting dep ' + id);
            delete Dependency.prototype.instance[id];
        }
    }
    // adjust the global next dependency ID to be the next available one now that many are gone
    let nextId = Dependency.prototype.nextId;
    while(!Dependency.prototype.instance.hasOwnProperty(nextId)) nextId--;
    Dependency.prototype.nextId = nextId+1;
};


/* DEPENDENCY PROTOTYPE - functions accessible to individual instances of Dependency */

// get the ID of this dependency object
Dependency.prototype.getId = function() {
    return this.id;
};

// get all keys that have been added to this tree
Dependency.prototype.getKeys = function() {
    return Object.keys(this.key);
};

// get the specified key or optionally create it if it doesn't exist yet
Dependency.prototype.getKey = function(key, create) {
    key = Dependency.cleanKey(key);
    let node = this.key[key];
    if(create && !node) node = this.key[key] = {
        waiting: {}, // what dependencies this one is waiting on -- see Dependency.prototype.wait below
        trigger: {}, // what dependencies are waiting on this one -- see Dependency.prototype.trigger below
        active: false, // whether this key is under a key that is currently being propagated
        propagated: false, // whether this key's value has been passed on to those waiting on it
        value: undefined // the value associated with this key
    };
    // within a Dependency, the word 'node' typically refers to the object for a given key (a node in the tree)
    // as opposed to a node in a law's tree (remember, the Dependency tree exists inside of one of those nodes)
    return node;
};

// execute the given callback function on the given key and each subkey of it
Dependency.prototype.each = function(key, callback) {
    for(let k in this.key) {
        let subkey = Dependency.subkey(key, k);
        if(subkey !== false) {
            if(callback.call(this, subkey, this.key[k]) === false) return false;
        }
    }
    return true;
};

// execute the given callback function only on direct children of the given key (not all subkeys)
Dependency.prototype.eachChild = function(key, callback) {
    for(let k in this.key) {
        if(Dependency.isChild(key, k)) {
            if(callback.call(this, k, this.key[k]) === false) return false;
        }
    }
    return true;
};

// get the value for a given key
Dependency.prototype.getValue = function(key) {
    let node = this.getKey(key);
    if(node) return node.value;
    else return undefined;
};

// set the value for a given key
Dependency.prototype.setValue = function(key, value) {
    // the key must exist to set its value, so we set create=true for getKey
    this.getKey(key, true).value = value;
};

// whether the given key is active (its type is being propagated)
Dependency.prototype.active = function(key) {
    let node = this.getKey(key);
    if(node) return node.active || false;
    else return false;
};

// mark the given key and all of its subkeys as active
Dependency.prototype.activate = function(key, active) {
    let self = this;
    active = (active === undefined ? true : active) || false;

    // loop over this key and all subkeys
    self.each(key, function(k, node) {
        if(node.active == active) return;
        // we should only inactivate a key if nothing that is waiting on it is active
        if(!active) {
            for(let depId in node.waiting) {
                for(let depKey in node.waiting[depId]) {
                    let dep = node.waiting[depId][depKey];
                    if(dep.active(depKey)) return; // quit if we find an active key waiting on us
                }
            }
        }
        node.active = active;
        // now we activate/inactivate everything we are waiting on, recursively
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

// inactivate this dependency and mark its references as unresolved
Dependency.prototype.reset = function() {
    // do so on each key of the tree
    this.each('', function(key, node) {
        // inactivate that key
        if(!node.active) return;
        node.active = false;
        // mark every reference that key is waiting un as unresolved
        for(let depId in node.waiting) {
            for(let depKey in node.waiting[depId]) {
                let obj = node.waiting[depId][depKey];
                obj.resolved = false;
                // and do the same to that reference recursively
                obj.dep.reset();
            }
        }
    });
};

// tell a given key of this tree that it must wait for a key of another dependency to resolve
Dependency.prototype.wait = function(dep, depKey, myKey, callback) {
    let node = this.getKey(myKey, true);
    Misc.setIndex(node.waiting, dep.getId(), depKey, { // index the reference on its id and key
        dep: dep, // keep a link to the dependency object
        callback: callback, // callback function to execute when the dependency is resolved
        resolved: false, // flag to track whether the dependency has been resolved
    });
    // that dependency needs to know we are waiting on it
    dep.addTrigger(this, depKey, myKey);

    //console.log(this.toString(myKey) + ' waiting on ' + dep.toString(depKey));
};

// tell a given key of this tree that another dependency's key is waiting on it
Dependency.prototype.addTrigger = function(dep, key, depKey) {
    let node = this.getKey(key, true);
    // index on the other dependency's id and key, and keep a link to its object
    Misc.setIndex(node.trigger, dep.getId(), depKey, dep);
    // if our key has already been resolved, pass it to the waiting dependency immediately
    if(this.active(key) && this.propagated(key)) {
        dep.resolve(this, key, depKey);
    }
};

// when a dependency I am waiting on resolves, it will call this function on me so that I
// can do whatever I need to with its now-known value
Dependency.prototype.resolve = function(dep, depKey, myKey) {
    let self = this;
    // if my key is not of a type currently being propagated, or has already been resolved and passed along, nothing to do
    if(!self.active(myKey) || self.propagated(myKey)) return false;

    let depId = dep.getId(), node = this.getKey(myKey),
        obj = Misc.getIndex(node.waiting, depId, depKey);
    // likewise if my key has already been marked as known, or my reference to this dependency has already been marked resolved
    if(node.known || !obj || obj.resolved) return true;

    //console.log(this.toString(myKey) + ' resolving ' + dep.toString(depKey) + ' to ' + dep.getValue(depKey));

    // if a callback function was registered for this reference, execute it now
    let callback = obj.callback;
    if(typeof callback === 'function') callback.call(this, dep, depKey, myKey);

    // mark this reference as resolved
    Misc.setIndex(node.waiting, depId, depKey, 'resolved', true);

    // see if this key is now fully resolved (no longer waiting on anything)
    self.checkResolved(myKey);
    return true;
};

// see if the entire sub-tree of the given key is resolved (not waiting on anything)
Dependency.prototype.resolved = function(key, doProbe) {
    let self = this;
    // make sure each key in the sub-tree is resolved
    let resolved = self.each(key, function(k, node) {
        // marking a key as 'known' means we consider it resolved, regardless of anything it is waiting on
        if(node.known) return true;
        let isWaiting = false;
        // which means any reference it is waiting on has been resolved
        for(let depId in node.waiting) {
            for(let depKey in node.waiting[depId]) {
                let obj = node.waiting[depId][depKey], depResolved = obj.resolved;
                // if doProbe set, we check if the reference is now resolved even though it hasn't been marked as such
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

// see if the entire sub-tree of the given key is resolved, and if so, pass along that key's value to anything waiting on it
Dependency.prototype.checkResolved = function(key, doProbe) {
    let self = this;
    // the key must be activate, not yet passed along, and fully resolved
    if(self.active(key) && !self.propagated(key) && self.resolved(key, doProbe)) {
        // perform any specific actions that should happen when a key is resolved
        // (implemented separately by each Dependency subclass)
        self.fullyResolve(key);
        // pass on the resolved key's data to any commands waiting on it
        self.propagate(key);
        // traverse the parents of the resolved key and see if any of these are now resolved
        let parent = self.getClosestParent(key);
        if(typeof parent === 'string') self.checkResolved(parent, doProbe);
        return true;
    } else return false;
};

// get the existing ancestor of the given key that is closest to it
// for example, if this Dependency contains keys 'visual' and 'visual.origin.x'
// but does not contain 'visual.origin', then 'visual' is the closest parent of 'visual.origin.x'
Dependency.prototype.getClosestParent = function(key) {
    let parent = Dependency.getParent(key);
    if(!parent) return undefined;
    while(!this.key.hasOwnProperty(parent) && parent.length > 0)
        parent = Dependency.getParent(parent);
    if(this.key.hasOwnProperty(parent)) return parent;
    return undefined;
};

// any action to be taken when a key is resolved; implemented by each Dependency subclass
Dependency.prototype.fullyResolve = function(key) {};

// pass on all fully resolved values in this tree to anything waiting on them
// (don't pass the values of keys that haven't been resolved yet)
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

// pass on the value of the given key to anything waiting on it
Dependency.prototype.propagate = function(key) {
    let node = this.getKey(key);
    // but only if it has not already been passed along
    if(node.propagated) return false;
    // loop through all dependencies waiting on this key
    for(let depId in node.trigger) {
        for(let depKey in node.trigger[depId]) {
            let dep = node.trigger[depId][depKey];
            // and let them know it is now resolved
            dep.resolve(this, key, depKey);
        }
    }
    // mark this key as having been propagated so we don't re-propagate it
    node.propagated = true;
    return true;
};

// whether the given key has already been propagated
Dependency.prototype.propagated = function(key) {
    let node = this.getKey(key);
    if(node) return node.propagated || false;
    return false;
};

// mark the given key as known; this declares the key as resolved, thus ignoring anything it may be waiting on
// - set recursive=true to mark the entire sub-tree of the key as known as well
Dependency.prototype.setKnown = function(key, known, recursive) {
    let self = this, allKnown = true;
    self.each(key, function(k, node) {
        if(recursive || k === key || (!key && !k)) {
            node.known = known;
        }
        // now that the key is known, it should be passed along if it hasn't yet
        if(known) self.checkResolved(k);
    });
};

// convert the subtree of the specified key into an object containing all subkeys and values for easy reference
// for example, if key = 'symbol' and we have the following subkeys:
//    symbol = 'hello'
//    symbol.subscript.0 = 'a'
//    symbol.subscript.1 = 'c'
//    symbol.superscript = '5'
// then the object will be:
//    { _value: 'hello', subscript: { 0: { _value: 'a' }, 1: { _value: 'c' } }, superscript: { _value: '5' } }
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

// Create the given key if it doesn't exist.  If it does, create a subkey of it using
// the next available numeric index.  For example, if the key is 'symbol.subscript', and
// we already have that key, but it has no numeric subkeys, we would create 'symbol.subscript.0'.
// If that one already exists, we create 'symbol.subscript.1'.  And so on.
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

// delete the entire key tree from this dependency object
Dependency.prototype.clear = function(key) {
    this.each(key, function(k, node) {
        delete this.key[k];
    });
};

// a string representation of this object for debugging purposes; overridden by each Dependency subclass
Dependency.prototype.toString = function(key) {
    return (key ? key + ' of ' : '') + 'DEP-' + this.id;
};

// print information about the given key for debugging
Dependency.prototype.print = function(key) {
    console.log(this.toString(key));
    let node = this.getKey(key);
    if(!node) return;
    // include all keys that this one is waiting on
    for(let depId in node.waiting) {
        for(let depKey in node.waiting[depId]) {
            console.log(' <= ' + node.waiting[depId].dep.toString(key));
        }
    }
};

// functions to call from the console to quickly get the given node or dependency
function dep(id) {
    return Dependency.prototype.instance[id];
}
function node(id) {
    return relation.nodes[id];
}


// the data tree inside a single node, containing information required to represent that node symbolically/visually
function NodeData(node) {
    Dependency.call(this);
    this.node = node;
}
NodeData.prototype = Object.create(Dependency.prototype);
NodeData.prototype.constructor = NodeData;

// I've been debating using the data tree to allow additional concepts to be added to the node;
// if so, the node must be re-evaluated every time it becomes an instance of a new concept, since it may
// match new predicates
NodeData.prototype.setValue = function(key, value) {
    Dependency.prototype.setValue.call(this, key, value);
    if(Dependency.subkey('concept', key) !== false) {
        this.node.setEvaluated(false);
        this.node.addToEvaluateQueue();
    }
};


// when a key of a node's data resolves, specific actions may need to be taken
NodeData.prototype.fullyResolve = function(key) {
    let self = this;
    switch(key) {
        // combine all subscripts, superscripts, arguments, etc. into one MathML string
        // and set this as the value of the 'symbol' key
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

// convert this object to a string for debugging
NodeData.prototype.toString = function(key) {
    let str = key ? key + ' of ' : '';
    if(this.node) str += this.node.getId();
    return str + ' [' + this.id + ']';
};


// a tree that stores all temporary variables used in this node's commands
function NodeVariables() {
    Dependency.call(this);
}
NodeVariables.prototype = Object.create(Dependency.prototype);
NodeVariables.prototype.constructor = NodeVariables;

// a variable never needs to be inactivated; if a command that uses it is inactive, then it won't be used anyway
NodeVariables.prototype.active = function(key) {
    return true;
};


// a command that modifies a specific key of a node's data, by operating on it with an expression
// that generally references data from this or other nodes
function NodeDataCommand(dep, key, op, exp, rec, vari) {
    let self = this;
    Dependency.call(this);
    this.node = null; // the node whose data is to be modified by this command
    this.operation = op; // the operation via which the expression is applied to the target data
    this.expression = exp; // the expression, as an Expression object (defined below)
    this.recursive = rec || false; // whether subkeys of the expression's value should be created in our target node
    this.variable = vari || null; // optional variable in which to store the target node's data key
    this.setTarget(dep, key);
}
NodeDataCommand.prototype = Object.create(Dependency.prototype);
NodeDataCommand.prototype.constructor = NodeDataCommand;

// set our target to the given key of the specified dependency object;
// the dependency may be either a NodeData or a NodeVariables; if it is a NodeVariables,
// then once that variable is pointed to some node's data (via another command), we will
// be notified and can set our target to be that data
NodeDataCommand.prototype.setTarget = function(dep, key) {
    let self = this;
    self.target = dep;
    if(key !== undefined) self.editKey = key;
    if(self.target instanceof NodeData) {
        self.setNode(self.target.node);
        // this command may store its target in a variable to be referenced by other commands
        // if so, that variable will wait for this command to resolve and then our target will be stored in it
        if(self.variable) {
            let vars = self.node.variables;
            // that variable waits for us to resolve
            vars.wait(self, '', self.variable, function() {
                // and then we store our target in it
                vars.setValue(self.variable, {dep: self.target, key: self.editKey});
            });
        }
        // now that we know what data we are modifying, we can modify it once our expression resolves
        self.wait(self.expression);
        // our target is not resolved until we perform our modification of it
        self.target.wait(self, '', self.editKey);
        // since we know what data key we are editing, we can check if it is currently being propagated
        this.checkActive();
    }
};

// set which node's data this command is modifying
NodeDataCommand.prototype.setNode = function(node) {
    this.node = node;
    node.addCommand(this);
};

// once we know what data key we are editing, we can see whether it is a subkey of a key type that
// is currently being propagated (for example, 'visual' if we are performing visualization)
NodeDataCommand.prototype.checkActive = function() {
    let self = this;
    if(!(this.target instanceof NodeData)) return false;
    let key = this.editKey.split('.')[0];
    if(Dependency.propagating(key)) this.activate();
};

// when a command uses the '=' operator, ie. it assigns a value to the data key being edited,
// then once the command resolves we can consider that key to be 'known'
// (an '=' command overwrites any value already in the data key, so it is essentially asserting that
// it is the only command needed to resolve that data)
NodeDataCommand.prototype.checkKnown = function() {
    let self = this;
    if(!(self.target instanceof NodeData)) return false;
    if(self.isAssignment()) {
        self.target.setKnown(self.editKey, true, self.recursive);
        return true;
    } else return false;
};

// check whether this command is assigning a value to the data key it modifies, as opposed
// to eg. incrementing it or concatenating it with something
NodeDataCommand.prototype.isAssignment = function() {
    return this.operator === '=';
};

// if our target is a variable, then once some other command points that variable to some node data,
// we will be notified, and we should point our target to that same data
NodeDataCommand.prototype.resolve = function(dep, depKey, myKey) {
    let self = this;
    if(dep instanceof NodeVariables) {
        let value = dep.getValue(depKey);
        self.setTarget(value.dep, Dependency.concatKey(value.key, self.editKey));
    }
    // otherwise, we are just resolving our expression, and should proceed as normal
    Dependency.prototype.resolve.call(self, dep, depKey, myKey);
};

NodeDataCommand.prototype.fullyResolve = function() {

    /*
    we now have a target node with a specified data key; an operation; and an expression, where the expression value
    may have subkeys; the data key and any subkeys must be created in the target node if necessary,
    then the operation applied

    the 'add', 'addval', and 'clear' operations are built in (we can invent more as needed); if the operation is anything
    else, it is parsed as raw JavaScript

    a command takes care of updating its target, so it doesn't need to store a value, but you'll see below that we set its value
    to an array containing the target data/key pair, just in case that info is needed for debugging
    */

    let self = this, data = self.target, expression = self.expression;
    switch(self.operation) {

        case 'add':
            let keys = expression.getKeys();
            // if the expression is a single value, treat it as a name, and create a subkey of the
            // key we are editing, with that name
            if(keys.length === 1 && keys[0] === '') {
                let key = data.addIndex(Dependency.concatKey(self.editKey, expression.getValue()));
                self.setValue('', [data, key]);
            // if the expression is itself a tree, add all of its subkeys (not its root) to the
            // key we are editing
            } else {
                expression.each('', function(key, node) {
                    if(key === '') return;
                    data.setValue(Dependency.concatKey(self.editKey, key), node.value);
                });
                self.setValue('', [data, self.editKey]);
            }
            break;
        case 'addval':
            // create the edit key if it doesn't exist, or if it does, create a subkey of it with the next
            // available numeric index, and set its value to that of the expression (ignore any subkeys of expression)
            let key = data.addIndex(self.editKey);
            data.setValue(key, expression.getValue());
            self.setValue('', [data, self.editKey]);
            break;
        case 'clear':
            // get rid of any subkeys of the key we are editing; this operation doesn't require an expression
            data.clear(self.editKey);
            self.setValue('', [data, self.editKey]);
            break;
        default:
            // if not one of the custom operators above, treat the operator as raw JavaScript

            // loop through all subkeys of the expression
            self.expression.each('', function(key, node) {

                // if the recursive flag was not set, we only use the root key
                if(!self.recursive && key !== '') return;

                // get the value of this expression subkey and convert it to JavaScript code (ie. quote it if it is a string)
                let nodeValue = node.value;
                if(nodeValue === undefined) return;
                else if(typeof nodeValue === 'string')
                    nodeValue = "'" + nodeValue + "'";

                // get the current value of the corresponding subkey of our target
                let myKey = Dependency.concatKey(self.editKey, key),
                    myValue = data.getValue(myKey);
                // if we don't have this subkey yet, give it the default value corresponding to the data type of the
                // expression's subkey
                if(myValue === undefined) {
                    if(typeof nodeValue === 'number') myValue = 0;
                    else myValue = '';
                }

                // create a raw JavaScript command that will update our target subkey with the value of the expression's subkey
                let code = 'myValue ' + self.operation + ' ' + nodeValue;
                //console.log('code for ' + self.toString());
                //console.log(code);

                // and execute it
                eval(code);
                data.setValue(myKey, myValue);
            });
            self.setValue('', [data, self.editKey]);
            // if the operation was to assign a value to the target, we can consider that final
            self.checkKnown();
            break;
    }
};

// convert this command to a string for debugging
NodeDataCommand.prototype.toString = function(key) {
    let str = key ? key + ' of ' : '';
    if(this.target instanceof Dependency && this.target.node) str += this.target.node.getId();
    if(str && this.editKey) str += '.';
    str += this.editKey + (this.recursive ? ':R' : '') + ' ' + this.operation;
    if(this.expression instanceof Expression) str += ' ' + this.expression.toString();
    return str + ' [' + this.id + ']';
}


// the expression of a command, meaning all text that comes after the operator
function Expression() {
    Dependency.call(this);
    // we parse the node data references out of the expression, store them as 'reference blocks',
    // and store the text in between them as 'literal blocks'; once all references have resolved,
    // we replace the reference blocks with their resolved values, and execute the resulting string as raw JavaScript
    // in order to resolve the entire expression
    this.blocks = [];
}
Expression.prototype = Object.create(Dependency.prototype);
Expression.prototype.constructor = Expression;

// create a literal block (raw JavaScript)
Expression.prototype.addLiteralBlock = function(value) {
    this.blocks.push({type: 'literal', value: value});
};

// create a reference block and wait for that reference to resolve so we can resolve the whole expression
Expression.prototype.addReferenceBlock = function(dep, key, recursive) {
    this.blocks.push({type: 'reference', dep: dep, key: key, recursive: recursive});
    if(dep) this.wait(dep, key);
    return this.blocks.length-1;
};

// if a reference was to a variable, then once that variable resolves, we have to reset the
// reference to the node data to which that variable points
Expression.prototype.setReference = function(blockNum, dep, key) {
    let block = this.blocks[blockNum];
    block.dep = dep;
    block.key = key;
    if(dep) this.wait(dep, key);
};

Expression.prototype.fullyResolve = function() {

    /*
    Once all references are resolved, evaluate the expression.
    The expression will contain all subkeys that any of its references contain;
    when we evaluate a particular subkey, we use the value of that subkey, or its closest ancestor, from each reference.
    For example, if the expression is 'A.visual.origin:R + S.value * B.visual.delta:R', and both A.visual.origin
    and B.visual.delta have 'x' and 'y' subkeys, the expression will resolve to the following subkeys:

        '': A.visual.origin + S.value * B.visual.delta
        'x': A.visual.origin.x + S.value * B.visual.delta.x
        'y': A.visual.origin.y + S.value * B.visual.delta.y

    If for some reason the 'x' subkey of B.visual.delta had '0' and '1' subkeys, but nothing else were different,
    we would have 2 additional subkeys:

        'x.0': A.visual.origin.x + S.value * B.visual.delta.x.0
        'x.1': A.visual.origin.x + S.value * B.visual.delta.x.1
    */

    let self = this, expKeys = {'': true};

    //first identify all subkeys that are in at least one reference
    self.blocks.forEach(function(block) {
        if(block.type === 'reference' && block.recursive) {
            block.dep.each(block.key, function(key, node) {
                if(node.value != null)
                    Misc.setIndex(expKeys, key, true);
            });
        }
    });

    // for each subkey, if every reference has that subkey or an ancestor of it,
    // evaluate the expression for that subkey
    for(let key in expKeys) {
        let match = self.blocks.every(function(block) {
            if(block.type !== 'reference') return true;
            let parent = null;
            // (we only consider subkeys below root if the reference is flagged as recursive)
            if(block.recursive) {
                // find the closest ancestor of this subkey on this reference (starting with the subkey itself)
                // that has a non-null value
                for(let prefix = Dependency.concatKey(block.key, key);
                    !((parent = block.dep.getKey(prefix)) && (parent.value != null))
                    && prefix.length > block.key.length;
                    prefix = prefix.replace(/\.?[A-Za-z0-9]+$/, ''));
            } else {
                // for a non-recursive reference, we can only use the root key
                parent = block.dep.getKey(block.key);
            }
            // if the ancestor we got has a non-null value, we are okay
            if(parent && (parent.value != null)) {
                block.value = parent.value;
                return true;
            } else return false;
        });
        // if every reference block had a valid ancestor, we plug in all the ancestors' values and evaluate the subkey
        if(match) {
            let node = self.getKey(key, true), code = '';
            self.blocks.every(function(block) {
                let val = block.value;
                // if the expression is a single reference whose value is an object, we consider that object
                // to be the value of the expression
                if(self.blocks.length === 1 && typeof val === 'object') {
                    code = val;
                    return false;
                // otherwise we plug in the ancestor's value to the expression string (in JS format)
                } else if(block.type === 'reference' && typeof val === 'string') {
                    val = "'" + val + "'";
                }
                code += '' + val;
                return true;
            });
            //console.log('code for ' + self.toString(key));
            //console.log(code);

            // then we execute the code and that is the value of the expression for this subkey
            node.value = typeof code === 'string' ? eval(code) : code;
        }
    }
};

// convert this expression to a string for debugging
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


/*
    The fromNodeKey and fromPair functions are only called from evaluate.js, and they were used in a scheme
    where there would be actual nodes in the law tree that represent data commands; these nodes would be parsed
    during evaluation in order to construct the commands.  Now it seems like that functionality won't be needed.
*/
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









