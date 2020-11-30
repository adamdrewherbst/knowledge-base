class Dependency {
    constructor() {
        this.id = Dependency.nextId++;
        Dependency.record[this.id] = this;
        this.dependsOn = {};
        this.dependsOnMe = {};
        this.unresolved = {};
    }

    getId() {
        return this.id;
    }

    dependOn(dep, include) {
        include = include || (include === undefined);
        if(this.dependsOn.hasOwnProperty(dep.getId()) == include) return;
        if(include) this.dependsOn[dep.getId()] = dep;
        else delete this.dependsOn[dep.getId()];
        this.resolve(dep, !include);
        dep.dependOnMe(this);
    }

    dependOnMe(dep, include) {
        include = include || (include === undefined);
        if(this.dependsOnMe.hasOwnProperty(dep.getId()) == include) return;
        if(include) this.dependsOnMe[dep.getId()] = dep;
        else delete this.dependsOnMe[dep.getId()];
        dep.dependOn(this);
    }

    resolve(dep, resolved) {
        if(dep) {
            if(resolved === undefined) resolved = true;
            if(resolved) delete this.unresolved[dep.getId()];
            else this.unresolved[dep.getId()] = true;
            this.process(dep);
        }
        let unresolved = Object.keys(this.unresolved);
        if(unresolved.length == 0) {
            this.execute();
            for(let id in this.dependsOnMe) {
                this.dependsOnMe[id].resolve(this);
            }
        }
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


class Field extends Dependency {
    constructor() {
        super();
        this.value = null;
        this.updated = false;
        this.lastAssignCommand = null;
        this.lastEditCommand = null;
    }

    getValue() {
        return this.value;
    }

    setValue(value) {
        this.value = value;
    }

    getLastAssignCommand() {
        return this.lastAssignCommand;
    }

    setLastAssignCommand(command) {
        this.lastAssignCommand = command;
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

    setParent(parent) {
        this.parent = parent;
        if(parent) parent.addChild(this);
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
        if(value instanceof Part)
            value = value.getData();
        else if(typeof value === 'function')
            value = new value();
        else if(value === undefined)
            value = new Field();
        this.variables[name] = value;
        return value;
    }

    getVariable(name) {
        let variable = this.variables[name];
        if(variable) return variable;
        if(this.parent) return this.parent.getVariable(name);
        return null;
    }

    getField(path) {
        let field = eval('this.variables.' + path);
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
}


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
        this.fillFields(obj, newFields, '');
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
            let field = newFields[key],
                read = this.twoWay || (index > 0),
                write = this.twoWay || (index == 0);
            if(read) this.dependOn(field);
            if(write) field.dependOn(this);
        }
        this.fields[index] = newFields;
        this.previous[index] = {};
    }

    fillFields(obj, fields, path) {
        if(obj instanceof Field) fields[path] = obj;
        else if(typeof obj === 'object') {
            for(let key in obj) this.fillFields(obj[key], fields, path + '.' + key);
        }
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
        return refIndex > 0 || this.operator !== '=' || this.twoWay;
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
                        if(!this.reads(i)) field.setLastAssignCommand(this);
                    }
                    else field.setValue(this.previous[i][path]);
                }
            }
        }
    }

    addDependentCommand(command) {
        this.dependentCommands.push(command);
    }

    run() {
        let self = this;
        if(!self.hasRun) self.runIndex = Command.nextRunIndex++;
        self.setPriorValues();
        for(let p in self.fields[0]) {
            if(self.isDeclaration) {
            } else if(self.twoWay) {
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
                    else if(typeof piece === 'number') expr += self.previous[piece][p];
                }
                eval(expr);
                edit.setValue(value);
                if(!self.hasRun) edit.resolve(self);
            }
        }
        self.hasRun = true;
    }
}

Command.nextRunIndex = 1;


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
        let re = Reference.regex, match = re.exec(str);
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
    constructor() {}
    draw(context) {}
}

class Point extends Drawable {
    constructor() {
        super();
        this.x = new Field();
        this.y = new Field();
    }

    draw(context) {

    }
}

class Circle extends Drawable {

    constructor() {
        super();
        this.center = new Point();
        this.radius = new Field();
    }

    draw(context) {
        context.drawCircle(this.get('center.x'), this.get('center.y'), this.get('radius'));
    }
}

Drawable.instances = {Point: Point, Circle: Circle};


Part.prototype.getData = function() {
    if(!this.scope) this.scope = new Scope();
    return this.scope.getData();
};

Part.prototype.parseCommands = function() {

    let self = this, commandStr = self.getCommands(), re = Part.regex.predicate, predicate = null, index = 0;

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
};


Part.prototype.resetRepresent = function() {
    Dependency.record = {};
    Dependency.nextId = 1;
    Command.nextRunIndex = 1;
    this.eachIn(function(part) {
        part.scope = new Scope();
        part.blocks = [];
    })
};




