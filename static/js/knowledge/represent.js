class Dependency {
    constructor() {
        this.id = Dependency.nextId++;
        Dependency.record[this.id] = this;
        this.resolved = true;
        this.dependsOn = {};
        this.dependsOnMe = {};
    }

    getId() {
        return this.id;
    }

    dependOn(dep, include) {
        include = include || (include === undefined);
        if(this.dependsOn.hasOwnProperty(dep.getId()) == include) return;
        if(include) this.dependsOn[dep.getId()] = { dep: dep, resolved: false };
        else delete this.dependsOn[dep.getId()];
        dep.dependOnMe(this);
    }

    dependOnMe(dep, include) {
        include = include || (include === undefined);
        if(this.dependsOnMe.hasOwnProperty(dep.getId()) == include) return;
        if(include) this.dependsOnMe[dep.getId()] = { dep: dep, resolved: false };
        else delete this.dependsOnMe[dep.getId()];
        dep.dependOn(this);
    }

    resolve(dep) {
        this.dependsOn[dep.getId()].resolved = true;
        this.check(dep);
    }

    check(dep) {}
}

Dependency.nextId = 1;
Dependency.record = {};


class Field extends Dependency {
    constructor() {
        super();
        this.value = null;
    }

    getValue() {
        return this.value;
    }

    setValue(value) {
        this.value = value;
    }
}


class Block {
    constructor(part, paths, commands) {
        this.part = part;
        this.paths = paths || [];
        this.commands = commands || [];
        this.nextId = 1;
        this.maps = [];
        this.variables = {};
    }

    map() {
        let self = this, re = /([<>])([A-Za-z]+)(?::([A-Za-z]+))?/g;
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
        this.data = new Dependency();
        if(typeof variables === 'object')
            for(let name in variables) {
                this.addVariable(name, variables[name]);
            }
        this.commands = commands || [];
        this.children = [];
    }

    setParent(parent) {
        this.parent = parent;
        if(parent) parent.addChild(this);
    }

    addChild(scope) {
        this.children.push(scope);
    }

    getData() {
        return this.variables;
    }

    addVariable(name, value) {
        if(value instanceof Part)
            value = value.getData();
        this.variables[name] = value;
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

    compile() {
        let self = this, prevCommand = null;
        self.commands.forEach(function(commandStr) {
            if(!commandStr) return;
            let command = new Command(self, commandStr);
            command.parse();
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
        this.twoWay = false;
        this.arr = [];
        this.references = [];
        this.fields = [];
    }

    parse() {
        let declaration = this.str.match(Part.regex.declaration);
        if(declaration !== null) {
            let type = Drawable.instances[declaration[1]], name = declaration[2];
            this.scope.addVariable(name, type);
            return;
        }
        let reToken = /[^\s]+/g, inString = false, match = null;
        while((match = reToken.exec(this.str)) !== null) {
            let token = match[0], first = token[0], last = token[token.length-1];
            if(inString && last === inString) inString = false;
            else if(first === "'" || first === '"') inString = first;
            else {
                let reference = Reference.parse(token, this.scope);
                if(reference) this.addReference(reference, match.index);
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

    addReference(reference, index) {
        if(!reference) return;
        if(index > this.index)
            this.arr.push(this.str.substring(this.index, index));
        this.arr.push(this.references.length);
        this.references.push(reference);
        this.index = index + reference.length;
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
    }

    fillFields(obj, fields, path) {
        if(obj instanceof Field) fields[path] = obj;
        else if(typeof obj === 'object') {
            for(let key in obj) this.fillFields(obj[key], index, path + '.' + key);
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
                resolved = !(reference instanceof Reference) || self.depends.on[reference.getId()].resolved;
            if(this.twoWay && resolved) return true;
            if(!this.twoWay && !resolved) return false;
        }
        return !this.twoWay;
    }

    check(dep) {
        let unresolved = Object.keys(this.unresolved);

        // first see if our scope hasn't even been run yet
        if(unresolved.length == 1 && unresolved[0] = this.scope.getId()) {
            this.scope.resolve(this);
        }
        else if(unresolved.length == 0) {
            this.run(dep);
        }
    }

    run(dep) {
        let self = this, [index, path] = self.getPath(dep);
        for(let p in self.fields[0]) {
            if(path !== null && p !== path) continue;
            if(self.twoWay) {
                for(let i = 0; i < 2; i++) {
                    if(index !== null && i !== index) continue;
                    let edit = self.fields[(i+1)%2][p].getValue(),
                        read = self.fields[i][p].getValue();
                    edit.setValue(read.getValue());
                    edit.resolve(read);
                }
            } else {
                let edit = self.references[0][p], value = edit.getValue(), expr = 'value';
                for(let i = 1; i < self.arr.length; i++) {
                    let piece = self.arr[i];
                    if(typeof piece === 'string') expr += ' ' + piece;
                    else if(typeof piece === 'number') expr += ' ' + self.references[piece][p].getValue();
                }
                eval(expr);
                edit.setValue(value);
            }
        }
    }
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

    check(dep) {
        let self = this, i = 0;
        for(i = self.index; i < self.arr.length; i++) {
            let piece = self.arr[i];
            if(typeof piece === 'string')
                self.obj = eval('self.obj.' + piece);
            else if(piece instanceof Reference && self.resolved[piece.getId()])
                self.obj = self.obj[piece.getValue()];
            else break;
        }
        self.index = i;
        if(self.command) {
            self.command.determineFields(self);
            if(self.index === self.arr.length) self.command.resolve(self);
        }
    }

    static parse(str, scope) {

        //determine which part is referred to
        let re = Reference.regex, match = re.exec(str);
        if(!match) return false;

        let field = scope.getField(match[0]);
        if(!field) field = scope.getField('this.' + match[0]);
        if(!field) return false;

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

Reference.regex = /([A-Za-z]+)((?:\.[A-Za-z]+)+)/g;



class Drawable {
    constructor() {
        super();
    }
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
    let self = this;
    self.scope = new Scope();
    self.blocks = [];

    let commandStr = self.getCommands(), re = Part.regex.predicate, predicate = null, index = 0;

    while((predicate = re.exec(commandStr)) !== null) {

        if(predicate.index > index) {
            let commands = commandStr.substring(index, predicate.index).trim().split(/\s*\n\s*/);
            self.scope.commands.push(...commands);
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
        self.scope.commands.push(...commands);
    }

    self.scope.compile();
};

Part.buildRegex = function() {
    let declaration = new RegExp('\s*(' + Object.keys(Drawable.instances).join('|') + ') ([A-Za-z]+)'),
        predicate = /\s*(([<>]?[A-Za-z]+(?::[A-Za-z]+)?)+(?:\s*&\s*)?)+\s*{/g;

    Part.regex = {
        declaration: declaration,
        predicate: predicate
    };
};







