class Node {
    constructor() {
        this.part = null;
        this.scope = null;
        this.name = null;
        this.idString = null;
        this.parent = null;
        this.children = {};
    }

    getIdString() {
        return this.idString;
    }

    setIdString(str) {
        this.idString = str;
        Node.record[this.idString] = this;
    }

    getPart() {
        return this.part;
    }

    setPart(part) {
        this.part = part;
    }

    getScope() {
        return this.scope;
    }

    setScope(scope) {
        this.scope = scope;
    }

    getParent() {
        return this.parent;
    }

    setParent(parent, name) {
        this.parent = parent;
        this.name = name;
        if(parent) {
            this.setPart(parent.getPart());
            if(!(this instanceof Scope))
                this.setScope(parent.getScope());
            this.setIdString(parent.getIdString() + '.' + name);
            let self = this;
            this.eachChild(function(child, name) {
                child.setParent(self, name);
            });
        }
    }

    addChild(name, value) {
        if(typeof name === 'object' || typeof name === 'function') {
            value = name;
            name = 0;
            while(this.children.hasOwnProperty(name)) name++;
        }
        let isParent = true;
        if(value instanceof Part) {
            value = value.getData();
            isParent = false;
        }
        else if(typeof value === 'function')
            value = new value();
        else if(value === undefined)
            value = new Node();
        this.children[name] = value;
        if(isParent) value.setParent(this, name);
        return value;
    }

    getChild(name) {
        if(!name) return this;
        return this.children[name];
    }

    eachChild(callback) {
        for(let name in this.children) {
            let child = this.children[name];
            if(callback.call(child, child, name) === false) return false;
        }
        return true;
    }

    forEach(callback) {
        let i = 0, child = null;
        while((child = this.children[i++]) instanceof Node) {
            callback.call(child, child);
        }
    }

    getNode(path) {
        let arr = path.split('.'), node = this;
        for(let i = 0; i < arr.length; i++) {
            let name = arr[i];
            node = node.getChild(name);
            if(!node) return null;
        }
        return node;
    }

    getValue(path) {
        let node = this.getNode(path);
        if(node instanceof Field) return node.getValue();
        return null;
    }

    setValue(path, value) {
        let node = this.getNode(path);
        if(node instanceof Field) node.setValue(value);
    }

    setLocked(locked) {
        this.eachField(function(field) {
            field.setLocked(true);
        });
    }

    each(callback, path, type) {
        path = path || '';
        if(!type || this instanceof type)
            return callback.call(this, this, path) !== false;
        for(let name in this.children) {
            let child = this.children[name], newPath = path + '.' + name;
            if(child.getParent() !== this) continue;
            if(!type || child instanceof type) {
                if(callback.call(child, child, newPath) === false) return false;
            } else if(child.each(callback, newPath, type) === false) return false;
        }
        return true;
    }

    eachField(callback, path) {
        return this.each(callback, path, Field);
    }

    eachDrawable(callback, path) {
        return this.each(callback, path, Drawable);
    }
}

Node.record = {};
Node.get = function(idString) {
    return Node.record[idString];
}
function n(idString) {
    return Node.get(idString);
}


class Dependency extends Node {
    constructor() {
        super();
        this.id = Dependency.nextId++;
        Dependency.record[this.id] = this;
        this.dependsOn = {};
        this.dependsOnMe = {};
        this.unresolved = {};
        this.resolved = false;
    }

    getId() {
        return this.id;
    }

    dependOn(dep, include) {
        include = include || (include === undefined);
        if(this.dependsOn.hasOwnProperty(dep.getId()) == include) return;
        if(include) {
            this.dependsOn[dep.getId()] = dep;
            this.resolved = false;
        }
        else delete this.dependsOn[dep.getId()];
        dep.dependOnMe(this);
    }

    dependOnMe(dep, include) {
        include = include || (include === undefined);
        if(this.dependsOnMe.hasOwnProperty(dep.getId()) == include) return;
        if(include) {
            this.dependsOnMe[dep.getId()] = dep;
            this.resolved = false;
        }
        else delete this.dependsOnMe[dep.getId()];
        dep.dependOn(this);
    }

    resolve(dep, resolved) {
        if(this.resolved) return;
        if(dep) {
            if(resolved === undefined) resolved = true;
            if(resolved) delete this.unresolved[dep.getId()];
            else this.unresolved[dep.getId()] = true;
            this.process(dep);
        }
        let unresolved = Object.keys(this.unresolved);
        if(unresolved.length == 0) {
            console.log('resolving ' + this.toString());
            this.resolved = true;
            this.execute();
            for(let id in this.dependsOnMe) {
                this.dependsOnMe[id].resolve(this);
            }
        } else this.resolved = false;
    }

    hasResolved() {
        return this.resolved;
    }

    process(dep) {}

    execute() {}
}

Dependency.nextId = 1;
Dependency.record = {};
Dependency.each = function(callback) {
    for(let id in Dependency.record) {
        let dep = Dependency.record[id];
        callback.call(dep, dep);
    }
};

Dependency.clearUpdated = function() {
    Dependency.each(function(dep) {
        dep.updated = false;
    });
};

Dependency.get = function(data) {
    if(typeof data === 'number') return Dependency.record[data];
    if(typeof data === 'string') {
        let match = data.match(/^([0-9]+)(?:\.([0-9]+))?(?:-([0-9]+))?((?:\.[A-Za-z]+)+)?$/);
        if(!match) return null;
        let dep = Part.get(match[1]).scope;
        if(match[2]) dep = dep.children[parseInt(match[2])-1];
        if(match[3]) dep = dep.commands[parseInt(match[3])-1];
        else if(match[4]) dep = dep.getField(match[4]);
        return dep;
    }
    return null;
};

function d(data) { return Dependency.get(data); }


class Field extends Dependency {
    constructor() {
        super();
        this.value = 0;
        this.previousValue = null;
        this.updated = false;
        this.lastInitCommand = null;
        this.lastEditCommand = null;
        this.locked = false;
    }

    getValue() {
        return this.value;
    }

    setValue(value) {
        this.value = value;
    }

    getPreviousValue() {
        return this.previousValue;
    }

    setPreviousValue() {
        this.previousValue = this.value;
    }

    getLastInitCommand() {
        return this.lastInitCommand;
    }

    setLastInitCommand(command) {
        this.lastInitCommand = command;
    }

    getLastEditCommand() {
        return this.lastEditCommand;
    }

    setLastEditCommand(command) {
        this.lastEditCommand = command;
    }

    setLocked(locked) {
        this.locked = locked;
    }

    isLocked() {
        return this.locked;
    }
}


class Block {
    constructor(part, paths, commands) {
        this.part = part;
        this.paths = paths || [];
        this.commands = commands || [];
        this.nextId = 1;
        this.chains = [];
        this.ids = [];
        this.maps = [];
        this.variables = {};
    }

    map() {
        let self = this, re = /([<>])([A-Za-z_]+)(?::([A-Za-z_]+))?/g;
        re.lastIndex = 0;

        self.paths.forEach(function(pathStr, pathInd) {

            //parse the path string into an array and give ID's to its parts
            let index = 0, match = null, chain = [], ids = [];
            while((match = re.exec(pathStr)) !== null) {

                let direction = match[1], concept = match[2], variable = match[3];

                //first parse the direction indicator
                chain.push(direction);

                //then the concept and/or variable name
                if(concept in self.variables && !variable) {
                    let variable = self.variables[concept];
                    chain.push(variable.concept);
                    ids.push(variable.id);
                } else {
                    let id = self.nextId++;
                    chain.push(concept);
                    ids.push(id);
                    if(variable) {
                        self.variables[variable] = {id: id, concept: concept};
                    }
                }
            }
            self.chains.push(chain);
            self.ids.push(ids);
        });

        self.chains.forEach(function(chain, pathInd) {

            let ids = self.ids[pathInd];

            //listen for the path on our part
            self.part.each(chain, function(path) {

                //when found, make a map of it
                let map = {from: {}, to: {}};
                path.forEach(function(part, i) {
                    map.from[ids[i]] = part;
                    map.to[part.getId()] = ids[i];
                });
                self.addPathMap(map, pathInd);
            }, {
                dynamic: true,
                returnPath: true
            });
        });
    }

    addPathMap(map, pathInd) {
        let self = this;
        map.paths = {};
        map.paths[pathInd] = true;
        self.addMap(map);

        //see if this path map can be merged with any of our existing maps
        self.maps.forEach(function(other) {
            if(other.paths[pathInd]) return;
            for(let id in other.from)
                if(map.from.hasOwnProperty(id) && map.from[id] !== other.from[id]) return;
            for(let id in other.to)
                if(map.to.hasOwnProperty(id) && map.to[id] !== other.to[id]) return;
            self.addMap({
                paths: Object.assign({}, map.paths, other.paths),
                from: Object.assign({}, map.from, other.from),
                to: Object.assign({}, map.to, other.to),
            });
        });
    }

    addMap(map) {
        this.maps.push(map);
        let complete = true;
        for(let i = 1; i < this.nextId; i++) {
            if(!(i in map.from)) {
                complete = false;
                break;
            }
        }
        if(complete) {
            this.makeScope(map);
        }
    }

    makeScope(map) {
        let self = this, variables = {'this': self.part};
        if(map) {
            for(let name in this.variables) {
                variables[name] = map.from[this.variables[name].id];
            }
        }
        let scope = new Scope(self.part.scope, variables, self.commands);
    }
}


class Scope extends Dependency {
    constructor(parent, variables, commands) {
        super();
        this.scope = this;
        if(parent instanceof Part) {
            this.part = parent;
            this.setIdString('' + this.part.getId());
        } else {
            parent.addSubScope(this);
        }
        this.addChild('var', Node);
        if(typeof variables === 'object')
            for(let name in variables) {
                this.addVariable(name, variables[name]);
            }
        this.commandStrings = commands || [];
        this.addChild('cmd', Node);
        this.addChild('sub', Node);
    }

    getParentScope() {
        return this.parent ? this.parent.scope : null;
    }

    getIndex() {
        return this.name;
    }

    getData() {
        return this.getChild('var');
    }

    getCommands() {
        return this.getChild('cmd');
    }

    addVariable(name, value) {
        return this.getData().addChild(name, value);
    }

    getVariable(path) {
        let variable = this.getData().getNode(path);
        if(variable instanceof Node) return variable;
        let parent = this.getParentScope();
        if(parent) return parent.getVariable(path);
        return null;
    }

    getField(path) {
        let field = this.getData().getNode(path);
        if(field instanceof Field) return field;
        let parent = this.getParentScope();
        if(parent) return parent.getField(path);
        return null;
    }

    eachDrawable(callback) {
        if(this.getData().eachDrawable(callback) === false) return false;
        return this.eachSubScope(function(sub) {
            return sub.eachDrawable(callback);
        });
    }

    addCommands(commands) {
        let self = this;
        if(typeof commands === 'string') commands = [commands];
        commands.forEach(function(str) {
            if(str) self.commandStrings.push(str);
        });
    }

    eachCommand(callback) {
        this.getCommands().forEach(callback);
    }

    getSubScopes() {
        return this.getChild('sub');
    }

    addSubScope(scope) {
        this.getSubScopes().addChild(scope);
    }

    eachSubScope(callback) {
        this.getSubScopes().forEach(callback);
    }

    compile() {
        let self = this;
        self.commandStrings.forEach(function(commandStr) {
            if(!commandStr) return;
            let firstOnly = commandStr.match(/^1:\s*/);
            if(firstOnly) {
                if(self.getIndex() > 0) return;
                commandStr = commandStr.substring(firstOnly[0].length);
            }
            let command = new Command(commandStr);
            if(!command) return;
            let scope = firstOnly ? self.getParentScope() : self;
            scope.getCommands().addChild(command);
            scope.dependOn(command);
            command.parse();
            if(scope.hasResolved()) command.resolve();
        });
    }

    execute() {
        this.eachCommand(function(command) {
            command.run();
        });
    }

    printFields() {
        let self = this;
        self.getData().eachField(function(field) {
            if(field.scope === self)
                console.log(field.getIdString() + ' = ' + field.getValue());
        });
        self.eachSubScope(function(sub) {
            sub.printFields();
        });
    }
}


class Command extends Dependency {
    constructor(str) {
        super();
        this.str = str;
        this.index = 0;
        this.operator = null;
        this.isDeclaration = false;
        this.twoWay = false;
        this.arr = [];
        this.references = [];
        this.fields = [];
        this.previous = [];
        this.dependentCommands = [];
        this.hasRun = false;
        this.runIndex = null;
    }

    parse() {
        let declaration = this.str.match(Part.regex.declaration);
        if(declaration !== null) {
            let type = Drawable.instances[declaration[1]], name = declaration[2],
                variable = this.scope.addVariable(name, type);
            this.isDeclaration = true;
            this.addReference(variable)
            return;
        }
        let assignment = this.str.match(/^([A-Za-z]+)\s+=/);
        if(assignment !== null) {
            let name = assignment[1];
            if(!this.scope.getVariable(name)) this.scope.addVariable(name);
        }
        let reToken = /[^\s]+/g, inString = false, match = null;
        reToken.lastIndex = 0;
        while((match = reToken.exec(this.str)) !== null) {
            let token = match[0], first = token[0], last = token[token.length-1];
            if(inString && last === inString) inString = false;
            else if(first === "'" || first === '"') inString = first;
            else {
                let reference = Reference.parse(token, this.scope);
                if(reference) this.addReference(reference, match.index, token.length);
                else if(!this.operator) this.setOperator(token);
            }
        }
        if(this.index < this.str.length)
            this.arr.push(this.str.substring(this.index, this.str.length));
    }

    setOperator(operator) {
        this.operator = operator;
        if(operator === '<=>') {
            this.twoWay = true;
        }
    }

    addReference(reference, index, length) {
        if(!reference) return;
        if(index > this.index)
            this.arr.push(this.str.substring(this.index, index));
        this.index = index + length;
        this.arr.push(this.references.length);
        this.references.push(reference);
        if(reference instanceof Reference) {
            reference.setCommand(this);
            this.dependOn(reference);
        }
        this.determineFields(reference);
    }

    determineFields(reference) {
        let newFields = {}, node = reference instanceof Reference ? reference.getNode() : reference;
        node.eachField(function(field, path) {
            newFields[path] = field;
        });
        let index = this.references.indexOf(reference),
            oldFields = this.fields[index];
        if(oldFields) {
            for(let key in oldFields) {
                if(!(key in newFields)) {
                    let field = oldFields[key];
                    this.dependOn(field, false);
                    field.dependOn(this, false);
                }
            }
        }
        for(let key in newFields) {
            let field = newFields[key];
            if(field.getPart() === this.getPart()) continue;
            let read = this.twoWay || (index > 0),
                write = this.twoWay || (index == 0);
            if(read) this.dependOn(field);
            if(write) field.dependOn(this);
        }
        this.fields[index] = newFields;
        this.previous[index] = {};
    }

    allReferencesResolved() {
        for(let i = 0; i < this.references.length; i++) {
            if(!this.twoWay && i == 0) continue;
            let reference = this.references[i],
                resolved = !(reference instanceof Reference) || !self.unresolved[reference.getId()];
            if(this.twoWay && resolved) return true;
            if(!this.twoWay && !resolved) return false;
        }
        return !this.twoWay;
    }

    reads(refIndex) {
        return refIndex > 0 || this.twoWay || (!this.isDeclaration && this.operator !== '=');
    }

    edits(refIndex) {
        return refIndex == 0 || this.twoWay;
    }

    setPriorValues() {
        for(let i = 0; i < this.fields.length; i++) {
            for(let path in this.fields[i]) {
                let field = this.fields[i][path];
                if(!this.hasRun || field.updated) {
                    this.previous[i][path] = field.getValue();
                }
                if(this.reads(i) && !this.hasRun) {
                    let prior = field.getLastEditCommand();
                    if(prior) prior.addDependentCommand(this);
                }
                if(this.edits(i)) {
                    if(!this.hasRun) {
                        field.setLastEditCommand(this);
                        if(this.references.length > 1)
                            field.setLocked(true);
                        else if(!this.reads(i))
                            field.setLastInitCommand(this);
                    }
                    else field.setValue(this.previous[i][path]);
                }
            }
        }
    }

    addDependentCommand(command) {
        if(this.dependentCommands.indexOf(command) < 0)
            this.dependentCommands.push(command);
    }

    run() {
        console.log('running ' + this.toString());
        let self = this;
        if(!self.hasRun) self.runIndex = Command.nextRunIndex++;
        self.setPriorValues();
        for(let p in self.fields[0]) {
            if(self.isDeclaration) {
            } else if(self.twoWay) {
                if(!(p in self.fields[1])) throw 'Indices do not match for command ' + self.commandId;
                for(let i = 0; i < 2; i++) {
                    let edit = self.fields[(i+1)%2][p].getValue(),
                        read = self.fields[i][p].getValue();
                    edit.setValue(read.getValue());
                    edit.resolve(read);
                }
            } else {
                let edit = self.fields[0][p], value = edit.getValue(), expr = 'value';
                for(let i = 1; i < self.arr.length; i++) {
                    let piece = self.arr[i];
                    if(typeof piece === 'string') expr += piece;
                    else if(typeof piece === 'number') {
                        let prev = null;
                        if(self.references[piece] instanceof Field) prev = self.previous[piece][''];
                        else if(p in self.previous[piece]) prev = self.previous[piece][p];
                        if(prev === null) throw 'Indices do not match for command ' + self.commandId;
                        expr += prev;
                    }
                }
                eval(expr);
                edit.setValue(value);
                edit.updated = true;
                if(!self.hasRun) edit.resolve(self);
            }
        }
        self.hasRun = true;
    }
}

Command.nextRunIndex = 1;

Command.update = function(updatedFields) {
    let rerun = {};
    updatedFields.eachField(function(field) {
        field.updated = true;
        let command = field.getLastInitCommand(),
            getDependent = function(cmd) {
                cmd.dependentCommands.forEach(function(dep) {
                    rerun[dep.runIndex] = dep;
                    getDependent(dep);
                });
            };
        if(command) getDependent(command);
    });
    let indices = Object.keys(rerun).sort();
    indices.forEach(function(index) {
        rerun[index].run();
    });
    Dependency.clearUpdated();
}


class Reference extends Dependency {
    constructor(node) {
        super();
        this.node = node;
        this.parsed = false;
        this.arr = [];
        this.index = 0;
        this.len = 0;
    }

    addPiece(piece) {
        this.arr.push(piece);
        if(piece instanceof Reference) self.dependOn(piece);
    }

    setCommand(command) {
        this.command = command;
    }

    getField() {
        if(this.node instanceof Field)
            return this.node;
        return null;
    }

    process(dep) {
        let self = this, i = 0;
        if(dep instanceof Reference) {
            let field = dep.getField();
            if(field) self.dependOn(field);
            else throw 'Nested reference is not to a field';
            return;
        }
        for(i = self.index; i < self.arr.length; i++) {
            let piece = self.arr[i];
            if(typeof piece === 'string')
                self.node = self.node.getNode(piece);
            else if(piece instanceof Field && !self.unresolved[piece.getId()])
                self.node = self.node.getChild(piece.getValue());
            else break;
        }
        if(self.command && i > self.index) {
            self.command.determineFields(self);
        }
        self.index = i;
    }

    static parse(str, scope) {

        //determine which part is referred to
        let re = Reference.regex;
        re.lastIndex = 0;
        let match = re.exec(str);
        if(!match) return false;

        let node = scope.getVariable(match[0]);
        if(!node) return false;

        if(str[re.lastIndex] !== '[') return node;

        let ref = new Reference(node);

        while(str[re.lastIndex++] === '[') {
            let nested = Reference.parse(str, scope);
            if(!nested || str[re.lastIndex++] !== ']') return false;
            ref.addPiece(nested);
            if(str[re.lastIndex] === '.') {
                re.lastIndex++;
                let ext = re.exec(str);
                if(!ext) return false;
                ref.addPiece(ext[0]);
            }
        }

        ref.length = re.lastIndex - match.index;
        return ref;
    }
}

Reference.regex = /(?:[A-Za-z]+)(?:(?:\.[A-Za-z]+)+)?/g;



class Drawable extends Node {
    constructor() {
        super();
        if(!(this instanceof Point)) {
            this.addChild('position', Point).setLocked(true);
        }
        this.editProperty = null;
        this.hidden = false;
    }

    draw(context) {}

    display(context) {
        if(this.hidden) return;
        context.save();
        let pos = this.getChild('position');
        if(pos) {
            context.translate(pos.getValue('x'), pos.getValue('y'));
        }
        context.lineWidth = 5;
        context.strokeStyle='#202090';
        context.beginPath();
        this.draw(context);
        context.closePath();
        context.stroke();
        context.restore();
    }

    getDistance(x, y, property) {
        let node = null, xField = null, yField = null;
        if(property) {
            node = property instanceof Node ? property : this.getChild(property);
            xField = node.getChild('x');
            yField = node.getChild('y');
            if(!xField || !yField) return NaN;
        }
        let propertyX = xField ? parseFloat(xField.getValue()) : 0,
            propertyY = yField ? parseFloat(yField.getValue()) : 0;
        let position = this.getChild('position');
        if(position && node !== position) {
            propertyX += position.getValue('x');
            propertyY += position.getValue('y');
        }
        return Math.hypot(x - propertyX, y - propertyY);
    }

    getDistances(x, y) {
        let distances = {};
        //distances.position = this.getDistance(x, y, this.position);
        return distances;
    }

    contains(x, y) {
        return false;
    }

    suggest(property) {}

    setEdit(property) {
        if(property === null) {
            this.editProperty = null;
            return;
        }
        if(property == 'this') this.editProperty = this;
        else this.editProperty = this.getChild(property);
        if(this.editProperty) this.editProperty.eachField(function(field) {
            field.setPreviousValue();
        });
    }

    edit(x, y, dx, dy) {
        let xField = this.editProperty.getChild('x'), yField = this.editProperty.getChild('y');
        if(xField) xField.setValue(xField.getPreviousValue() + dx);
        if(yField) yField.setValue(yField.getPreviousValue() + dy);
    }

    propagateEdit() {
        Command.update(this.editProperty);
    }
}

class Point extends Drawable {
    constructor() {
        super();
        this.addChild('x', Field);
        this.addChild('y', Field);
    }

    draw(context) {
        context.arc(0, 0, 1, 0, 2*Math.PI);
    }

    getDistances(x, y) {
        let distances = {};
        /*if(!this.getChild('x').isLocked() && !this.getChild('y').isLocked()) {
            distances.this = this.getDistance(x, y, this);
        }//*/
        return distances;
    }
}

class Circle extends Drawable {

    constructor() {
        super();
        this.addChild('radius', Field);
    }

    draw(context) {
        context.arc(0, 0, this.getValue('radius'), 0, 2*Math.PI);
    }

    getDistances(x, y) {
        let distances = super.getDistances(x, y);
        if(!this.getChild('radius').isLocked()) {
            distances.radius = Math.abs(this.getDistance(x, y) - parseFloat(this.getValue('radius')));
        }
        return distances;
    }

    contains(x, y) {
        return this.getDistance(x, y) < this.getValue('radius');
    }

    edit(x, y, dx, dy) {
        super.edit(x, y, dx, dy);
        let radius = this.getChild('radius');
        if(this.editProperty === radius) {
            let dr = this.getDistance(x+dx, y+dy) - this.getDistance(x, y);
            radius.setValue(radius.getPreviousValue() + dr);
            console.log('changed radius by ' + dr + ' to ' + this.getValue('radius'));
        }
    }
}

class Arrow extends Drawable {
    constructor() {
        super();
        let components = this.addChild('components', Node);
        components.addChild('x', Field);
        components.addChild('y', Field);
    }

    draw(context) {
        context.moveTo(0, 0);
        context.lineTo(this.getValue('components.x'), this.getValue('components.y'));
    }

    contains(x, y) {
        let sum = this.getDistance(x, y) + this.getDistance(x, y, 'components'),
            length = Math.hypot(this.getValue('components.x'), this.getValue('components.y'));
        return sum < 1.1 * length;
    }

    getDistances(x, y) {
        let distances = super.getDistances(x, y);
        let components = this.getChild('components');
        if(!components.getChild('x').isLocked() && !components.getChild('y').isLocked()) {
            distances.components = this.getDistance(x, y, 'components');
        }
        return distances;
    }
}

Drawable.instances = {Point: Point, Circle: Circle, Arrow: Arrow};


Part.prototype.getData = function() {
    return this.scope.getData();
};

Part.prototype.parseCommands = function() {

    let self = this, commandStr = self.getAllCommands(), re = Part.regex.predicate, predicate = null, index = 0;
    re.lastIndex = 0;

    while((predicate = re.exec(commandStr)) !== null) {

        if(predicate.index > index) {
            let commands = commandStr.substring(index, predicate.index).trim().split(/\s*\n\s*/);
            self.scope.addCommands(commands);
        }

        let paths = predicate[0].replace('{','').trim().split(/\s*&\s*/),
            end = commandStr.indexOf('}', predicate.index),
            commands = commandStr.substring(re.lastIndex, end).trim().split(/\s*\n\s*/),
            block = new Block(self, paths, commands);
        self.blocks.push(block);
        block.map();

        re.lastIndex = end+1;
        index = re.lastIndex;
    }

    if(commandStr.length > index) {
        let commands = commandStr.substring(index).trim().split(/\s*\n\s*/);
        self.scope.addCommands(commands);
    }

    self.scope.compile();
    self.scope.eachCommand(function(command) {
        command.resolve();
    });
};

Part.buildRegex = function() {
    let declaration = new RegExp('\s*(' + Object.keys(Drawable.instances).join('|') + ') ([A-Za-z]+)'),
        predicate = /(?:(?:[<>][A-Za-z_]+(?::[A-Za-z_]+)?)+(?:\s*&\s*)?)+\s*{/g;

    Part.regex = {
        declaration: declaration,
        predicate: predicate
    };
};


Part.prototype.represent = function() {
    let self = this;
    self.resetRepresent();
    let parts = self.getIn();
    $.each(parts, function(id, part) {
        part.parseCommands();
    });
    $.each(parts, function(id, part) {
        part.scope.eachSubScope(function(sub) {
            sub.compile();
        })
    });
    Dependency.each(function(dep) {
        dep.resolve();
    });
    Dependency.clearUpdated();
    self.printData();
};

Part.prototype.resetRepresent = function() {
    Dependency.record = {};
    Dependency.nextId = 1;
    Command.nextRunIndex = 1;
    this.eachIn(function(part) {
        part.scope = new Scope(part);
        part.scope.addVariable('position', Point).setLocked(true);
        part.blocks = [];
    })
};

Part.prototype.printData = function() {
    this.eachIn(function(part) {
        part.scope.printFields();
    });
};

Part.prototype.display = function(context) {
    let self = this;
    if(self.hidden) return;
    let pos = self.getPosition();
    context.save();
    context.translate(pos.x, pos.y);
    self.eachDrawable(function(drawable) {
        console.log('part ' + self.id + ' drawing ' + drawable.idString + (drawable.hidden ? ' (hidden)' : ''));
        drawable.display(context);
    });
    context.restore();
};

Part.prototype.eachDrawable = function(callback) {
    return this.scope.eachDrawable(callback);
};

Part.prototype.getPosition = function() {
    let pos = this.scope.getVariable('position');
    return {
        x: pos.getValue('x'),
        y: pos.getValue('y')
    };
};

Part.prototype.getPreviousPosition = function() {
    let pos = this.scope.getVariable('position');
    return {
        x: pos.getChild('x').getPreviousValue(),
        y: pos.getChild('y').getPreviousValue()
    }
};

Part.prototype.setEditPosition = function() {
    let pos = this.scope.getVariable('position');
    pos.setEdit();
};

Part.prototype.editPosition = function(x, y, dx, dy) {
    let position = this.scope.getVariable('position');
    position.edit(x, y, dx, dy);
    position.propagateEdit();
};

Part.prototype.suggestPosition = function() {
};


