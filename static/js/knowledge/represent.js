class Node {
    constructor() {
        this.part = null;
        this.scope = null;
        this.idString = null;
        this.parent = null;
        this.children = {};
        this.value = null;
    }

    getIdString() {
        return this.idString;
    }

    setIdString(str) {
        this.idString = str;
        Node.record[this.idString] = this;
    }

    getValue() {
        return this.value;
    }

    setValue(value) {
        this.value = value;
    }

    getPart() {
        return this.part;
    }

    getScope() {
        return this.scope;
    }

    getParent() {
        return this.parent;
    }

    setParent(parent, name) {
        this.parent = parent;
        if(parent) {
            this.part = parent.getPart();
            this.scope = parent.getScope();
            this.setIdString(parent.getIdString() + '.' + name);
        }
    }

    addChild(name, value) {
        if(typeof name === 'object' || typeof name === 'function') {
            value = name;
            name = 0;
            while(this.children.hasOwnProperty(name)) name++;
        }
        if(value instanceof Part)
            value = value.getData();
        else if(typeof value === 'function')
            value = new value();
        else if(value === undefined)
            value = new Field();
        this.children[name] = value;
        value.setParent(this, name);
        return value;
    }

    getChild(name) {
        if(!name) return this;
        return this.children[name];
    }

    eachChild(callback) {
        for(let name in this.children) {
            let child = this.children[name];
            if(callback.call(child, child) === false) return false;
        }
        return true;
    }

    getNode(path) {
        let arr = path.split('.'), node = this;
        arr.forEach(function(name) {
            node = node.getChild(name);
        });
        return node;
    }

    eachField(callback) {
        if(this instanceof Field) {
            return callback.call(this, this) !== false;
        }
        for(let name in this.children) {
            let child = this.children[name];
            if(child instanceof Field) {
                if(callback.call(child, child) === false) return false;
            } else if(child.eachField(callback) === false) return false;
        }
        return true;
    }

    setLocked(locked) {
        this.eachField(function(field) {
            field.locked = true;
        });
    }

    eachDrawable(callback) {
        for(let name in this.children) {
            let child = this.children[name];
            if(child instanceof Drawable) {
                if(callback.call(child, child) === false) return false;
            } else if(child.eachDrawable(callback) === false) return false;
        }
        return true;
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
        this.updated = false;
        this.lastInitCommand = null;
        this.lastEditCommand = null;
        this.locked = false;
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
        if(parent instanceof Part) {
            this.part = parent;
        } else {
            this.setParent(parent);
        }
        this.addChild('variables', Node);
        if(typeof variables === 'object')
            for(let name in variables) {
                this.addVariable(name, variables[name]);
            }
        this.commandStrings = commands || [];
        this.addChild('commands', Node);
    }

    getData() {
        return this.getChild('variables');
    }

    getCommands() {
        return this.getChild('commands');
    }

    addVariable(name, value) {
        return this.getData().addChild(name, value);
    }

    getVariable(name) {
        let variable = this.getData().getChild(name);
        if(variable) return variable;
        if(this.parent) return this.parent.getVariable(name);
        return null;
    }

    eachDrawable(callback) {
        return this.getData().eachDrawable(callback);
    }

    getField(path) {
        let field = this.getData().getNode(path);
        if(field instanceof Field) return field;
        if(this.parent) return this.parent.getField(path);
        return null;
    }

    addCommands(commands) {
        let self = this;
        if(typeof commands === 'string') commands = [commands];
        commands.forEach(function(str) {
            if(str) self.commandStrings.push(str);
        });
    }

    compile() {
        let self = this;
        self.commandStrings.forEach(function(commandStr) {
            if(!commandStr) return;
            let command = new Command(commandStr);
            self.getCommands().addChild(command);
            self.dependOn(command);
            command.parse();
        });
    }

    execute() {
        let self = this, i = 0, command = null;
        while((command = self.getCommands().getChild(i++)) instanceof Command) {
            command.run();
        }
    }

    printFields() {
        let self = this;
        self.getData().eachField(function(field) {
            if(field.scope === self)
                console.log(field.getIdString() + ' = ' + field.getValue());
        });
        self.eachChild(function(child) {
            child.printFields();
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
        let newFields = {}, obj = reference instanceof Reference ? reference.getObj() : reference;
        Field.eachField(obj, function(field, path) {
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
            if(field.getPart() === this) continue;
            let read = this.twoWay || (index > 0),
                write = this.twoWay || (index == 0);
            if(read) this.dependOn(field);
            if(write) field.dependOn(this);
        }
        this.fields[index] = newFields;
        this.previous[index] = {};
    }

    getPath(field) {
        if(!field) return [null, null];
        for(let index in this.fields) {
            for(let path in this.fields[index]) {
                if(this.fields[index][path] === field) return [index, path];
            }
        }
        return [null, null];
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
                        if(!this.reads(i)) {
                            if(i == 0 && this.references.length == 1)
                                field.setLastInitCommand(this);
                            else field.locked = true;
                        }
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
    for(let name in updatedFields) {
        let field = updatedFields[name];
        field.updated = true;
        let command = field.getLastInitCommand(),
            getDependent = function(cmd) {
                cmd.dependentCommands.forEach(function(dep) {
                    rerun[dep.runIndex] = dep;
                    getDependent(dep);
                });
            };
        if(command) getDependent(command);
    }
    let indices = Object.keys(rerun).sort();
    indices.forEach(function(index) {
        rerun[index].run();
    });
    Dependency.clearUpdated();
}


class Reference extends Dependency {
    constructor(obj) {
        super();
        this.obj = obj;
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
        if(this.obj instanceof Field)
            return this.obj;
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
                self.obj = eval('self.obj.' + piece);
            else if(piece instanceof Field && !self.unresolved[piece.getId()])
                self.obj = self.obj[piece.getValue()];
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

        let field = scope.getField(match[0]);
        if(!field) return false;

        if(str[re.lastIndex] !== '[') return field;

        let ref = new Reference(field);

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
        if(!(this instanceof Point)) {
            this.addChild('position', Point).setLocked(true);
        }
        this.editProperty = null;
        this.editField = {};
        this.editPrevious = {};
        this.locked = {};
        this.idString = null;
    }

    draw(context) {}

    display(context) {
        context.save();
        if(this.position) {
            context.translate(this.position.x.getValue(), this.position.y.getValue());
        }
        context.lineWidth = 5;
        context.strokeStyle='#202090';
        context.beginPath();
        this.draw(context);
        context.closePath();
        context.stroke();
        context.restore();
    }

    getDistance(x, y, obj) {
        if(obj && (!obj.x || !obj.y || obj.x.locked || obj.y.locked)) return NaN;
        let objX = obj ? parseFloat(obj.x.getValue()) : 0,
            objY = obj ? parseFloat(obj.y.getValue()) : 0;
        if(this.position && obj !== this.position) {
            objX += this.position.x.getValue();
            objY += this.position.y.getValue();
        }
        return Math.hypot(x - objX, y - objY);
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
        let self = this;
        if(property !== 'this' && (!property || !self.hasOwnProperty(property))) {
            self.editProperty = null;
            return;
        }
        self.editProperty = property;
        self.editField = {};
        self.editPrevious = {};
        let obj = property === 'this' ? this : self[property];
        Field.eachField(obj, function(field, path) {
            let ind = path.replace(/^\./,'');
            self.editField[ind] = field;
            self.editPrevious[ind] = field.getValue();
        });
    }

    edit(x, y, dx, dy) {
        let self = this, xField = self.editField.x, yField = self.editField.y;
        if(xField) xField.setValue(self.editPrevious.x + dx);
        if(yField) yField.setValue(self.editPrevious.y + dy);
    }

    propagateEdit() {
        Command.update(this.editField);
    }
}

class Point extends Drawable {
    constructor(scope, value) {
        super(scope);
        this.addChild('x', Field);
        this.addChild('y', Field);
    }

    draw(context) {
        context.arc(0, 0, 1, 0, 2*Math.PI);
    }

    getDistances(x, y) {
        let distances = {};
        if(!this.locked.x && !this.locked.y) {
            distances.this = this.getDistance(x, y, this);
        }
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
        if(!this.radius.locked) {
            distances.radius = Math.abs(this.getDistance(x, y) - parseFloat(this.getValue('radius')));
        }
        return distances;
    }

    contains(x, y) {
        return this.getDistance(x, y) < this.getValue('radius');
    }

    edit(x, y, dx, dy) {
        super.edit(x, y, dx, dy);
        if(this.editProperty == 'radius') {
            let dr = this.getDistance(x+dx, y+dy) - this.getDistance(x, y);
            this.setValue('radius', this.editPrevious[''] + dr);
            console.log('changed radius by ' + dr + ' to ' + this.getValue('radius'));
        }
    }
}

class Arrow extends Drawable {
    constructor() {
        super();
        this.addChild('x', Field);
        this.addChild('y', Field);
    }

    draw(context) {
        context.lineTo(this.getValue('x'), this.getValue('y'));
    }

    contains(x, y) {
        let sum = this.getDistance(x, y) + this.getDistance(x, y, this),
            length = Math.hypot(this.getValue('x'), this.getValue('y'));
        return sum < 1.1 * length;
    }

    getDistances(x, y) {
        let distances = super.getDistances(x, y);
        distances.this = this.getDistance(x, y);
        return distances;
    }
}

Drawable.instances = {Point: Point, Circle: Circle, Arrow: Arrow};


Part.prototype.getData = function() {
    return this.scope.getData();
};

Part.prototype.parseCommands = function() {

    let self = this, commandStr = self.getCommands(), re = Part.regex.predicate, predicate = null, index = 0;
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
    self.scope.commands.forEach(function(command) {
        command.resolve();
    })
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
        part.scope.eachChild(function(child) {
            child.compile();
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
        part.scope.addVariable('position', Point);
        part.scope.variables.position._locked.x = true;
        part.scope.variables.position._locked.y = true;
        part.blocks = [];
    })
};

Part.prototype.printData = function() {
    this.eachIn(function(part) {
        part.scope.printFields();
    });
};

Part.prototype.eachDrawable = function(callback) {
    return this.scope.eachDrawable(callback);
};

Part.prototype.getPosition = function() {
    let pos = this.scope.variables.position;
    return {
        x: pos.x.getValue(),
        y: pos.y.getValue()
    };
};

Part.prototype.setEditPosition = function() {
    let pos = this.scope.variables.position;
    pos.setEdit('this');
};

Part.prototype.editPosition = function(x, y, dx, dy) {
    this.scope.variables.position.edit(x, y, dx, dy);
    this.scope.variables.position.propagateEdit();
};

Part.prototype.suggestPosition = function() {
};


