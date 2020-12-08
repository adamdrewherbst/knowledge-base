class Dependency {
    constructor() {
        this.id = Dependency.nextId++;
        this.idString = null;
        Dependency.record[this.id] = this;
        this.dependsOn = {};
        this.dependsOnMe = {};
        this.unresolved = {};
        this.resolved = false;
    }

    getId() {
        return this.id;
    }

    toString() {
        return this.idString;
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
    constructor(scope, value) {
        super();
        this.scope = scope;
        this.value = value;
        this.updated = false;
        this.lastInitCommand = null;
        this.lastEditCommand = null;
        this.locked = false;
    }

    getPart() {
        return this.scope.getPart();
    }

    getValue() {
        return this.value;
    }

    setValue(value) {
        this.value = value;
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

Field.eachField = function(obj, callback, path, level) {
    if(typeof obj !== 'object') return;
    if(obj instanceof Scope) return;
    if(path === undefined) path = '';
    if(level === undefined) level = 0;
    if(obj instanceof Field) callback.call(obj, obj, path);
    else for(let key in obj) Field.eachField(obj[key], callback, path + '.' + key, level + 1);
};


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
        this.setParent(parent);
        this.variables = {};
        if(typeof variables === 'object')
            for(let name in variables) {
                this.addVariable(name, variables[name]);
            }
        this.commandStrings = commands || [];
        this.commands = [];
        this.children = [];
    }

    getPart() {
        return this.part;
    }

    setParent(parent) {
        if(parent instanceof Part) {
            this.part = parent;
            this.idString = '' + parent.getId();
        } else {
            this.parent = parent;
            this.part = parent.part;
            if(parent) parent.addChild(this);
            this.idString = parent.idString + '.' + parent.children.length;
        }
    }

    addChild(scope) {
        this.children.push(scope);
    }

    eachChild(callback) {
        this.children.forEach(function(child) {
            callback.call(child, child);
        });
    }

    getData() {
        return this.variables;
    }

    addVariable(name, value) {
        let self = this;
        if(value instanceof Part)
            value = value.getData();
        else if(typeof value === 'function')
            value = new value(this);
        else if(value === undefined)
            value = new Field(this);
        self.variables[name] = value;
        if(value instanceof Drawable) {
            value.setIdString(self.idString + '.' + name);
        }
        Field.eachField(value, function(field, path) {
            if(!field.idString)
                field.idString = self.idString + '.' + name + path;
        });
        return value;
    }

    getVariable(name) {
        let variable = this.variables[name];
        if(variable) return variable;
        if(this.parent) return this.parent.getVariable(name);
        return null;
    }

    eachVariable(callback) {
        for(let name in this.variables) {
            if(name === 'this') continue;
            let variable = this.variables[name];
            if(callback.call(this, variable, name) === false) return false;
        }
        this.children.forEach(function(child) {
            child.eachVariable(callback);
        });
        return true;
    }

    eachDrawable(callback) {
        this.eachVariable(function(variable) {
            if(variable instanceof Drawable)
                callback.call(variable, variable);
        });
    }

    getField(path) {
        let prefix = 'this.variables';
        if(path[0] !== '.') prefix += '.';
        let field = null;
        try {
            field = eval(prefix + path);
        } catch(error) {}
        if(field) return field;
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
            let command = new Command(self, commandStr);
            command.parse();
            self.commands.push(command);
            self.dependOn(command);
        });
    }

    execute() {
        let self = this;
        self.commands.forEach(function(command) {
            command.run();
        });
    }

    printFields() {
        let self = this;
        Field.eachField(self.variables, function(field, path) {
            if(field.scope === self)
                console.log(field.idString + ' = ' + field.getValue());
        });
        self.children.forEach(function(child) {
            child.printFields();
        })
    }

    getPosition() {
        let pos = this.variables.position;
        if(typeof pos === 'object') {
            let x = pos.x.getValue(), y = pos.y.getValue();
            if(typeof x === 'number' && typeof y === 'number')
                return {x: x, y: y};
        }
        return null;
    }

    eachDisplayable(callback) {
        for(let name in this.variables) {
            if(name === 'this') continue;
            let variable = this.variables[name];
            if(variable instanceof Drawable) callback.call(variable, variable);
        }
        this.children.forEach(function(child) {
            callback.call(child, child);
        });
    }
}

Scope.display = function(obj, context) {
    let position = obj.getPosition();
    context.save();
    context.translate(position.x, position.y);
    if(obj instanceof Drawable) {
        obj.display(context);
    } else if(obj instanceof Scope) {
        obj.eachDisplayable(function(displayable) {
            Scope.display(displayable, context);
        });
    }
    context.restore();
};

Scope.getMouseProperty = function(obj, x, y, ret) {
    if(!ret.hasOwnProperty('distance')) ret.distance = Infinity;
    let position = obj.getPosition();
    x -= position.x;
    y -= position.y;
    let distance = Math.hypot(x, y);
    if(distance < ret.distance) {
        ret.distance = distance;
        ret.property = 'position';
        ret.owner = obj;
    }
    if(obj instanceof Drawable) {
        obj.getMouseProperty(x, y, ret);
    } else if(obj instanceof Scope) {
        obj.eachDisplayable(function(displayable) {
            Scope.getMouseProperty(displayable, x, y, ret);
        });
    }
};


class Command extends Dependency {
    constructor(scope, str) {
        super();
        this.scope = scope;
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
        this.idString = scope.idString + '-' + (scope.commands.length+1);
    }

    toString() {
        return this.idString + ': ' + this.str;
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
    Field.eachField(updatedFields, function(field) {
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



class Drawable {
    constructor(scope) {
        this.scope = scope;
        if(!(this instanceof Point)) {
            this.position = new Point(scope, 0);
            this.position._locked.x = true;
            this.position._locked.y = true;
        }
        this._editProperty = null;
        this._editField = {};
        this._editPrevious = {};
        this._locked = {};
        this._idString = null;
    }

    setIdString(str) {
        this._idString = str;
    }
    getIdString() {
        return this._idString;
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
            self._editProperty = null;
            return;
        }
        self._editProperty = property;
        self._editField = {};
        self._editPrevious = {};
        let obj = property === 'this' ? this : self[property];
        Field.eachField(obj, function(field, path) {
            let ind = path.replace(/^\./,'');
            self._editField[ind] = field;
            self._editPrevious[ind] = field.getValue();
        });
    }

    edit(x, y, dx, dy) {
        let self = this, xField = self._editField.x, yField = self._editField.y;
        if(xField) xField.setValue(self._editPrevious.x + dx);
        if(yField) yField.setValue(self._editPrevious.y + dy);
    }

    propagateEdit() {
        Command.update(this._editField);
    }
}

class Point extends Drawable {
    constructor(scope, value) {
        super(scope);
        if(value === undefined) value = 0;
        this.x = new Field(scope, value);
        this.y = new Field(scope, value);
    }

    draw(context) {
        context.arc(0, 0, 1, 0, 2*Math.PI);
    }

    getDistances(x, y) {
        let distances = {};
        if(!this._locked.x && !this._locked.y) {
            distances.this = this.getDistance(x, y, this);
        }
        return distances;
    }
}

class Circle extends Drawable {

    constructor(scope, radius) {
        super(scope);
        this.radius = new Field(scope, radius);
    }

    draw(context) {
        context.arc(0, 0, this.radius.getValue(), 0, 2*Math.PI);
    }

    getDistances(x, y) {
        let distances = super.getDistances(x, y);
        if(!this.radius.locked) {
            distances.radius = Math.abs(this.getDistance(x, y) - parseFloat(this.radius.getValue()));
        }
        return distances;
    }

    contains(x, y) {
        return this.getDistance(x, y) < this.radius.getValue();
    }

    edit(x, y, dx, dy) {
        super.edit(x, y, dx, dy);
        if(this._editProperty == 'radius') {
            let dr = this.getDistance(x+dx, y+dy) - this.getDistance(x, y);
            this.radius.setValue(this._editPrevious[''] + dr);
            console.log('changed radius by ' + dr + ' to ' + this.radius.value);
        }
    }
}

class Arrow extends Drawable {
    constructor(scope) {
        super(scope);
        this.components = {
            x: new Field(scope),
            y: new Field(scope)
        };
    }

    draw(context) {
        context.lineTo(this.components.x.getValue(), this.components.y.getValue());
    }

    contains(x, y) {
        let sum = this.getDistance(x, y) + this.getDistance(x, y, this.components),
            length = Math.hypot(this.components.x.getValue(), this.components.y.getValue());
        return sum < 1.1 * length;
    }

    getDistances(x, y) {
        let distances = super.getDistances(x, y);
        distances.components = this.getDistance(x, y, this.components);
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


