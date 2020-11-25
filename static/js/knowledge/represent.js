class Dependency {
    constructor() {
        this.id = Dependency.nextId++;
        Dependency.record[this.id] = this;
        this.resolved = true;
        this.dependsOn = {};
        this.dependsOnMe = {};
        this.children = {};
    }

    getId() {
        return this.id;
    }

    dependOn(dep, include) {
        include = include || (include === undefined);
        if(this.dependsOn.hasOwnProperty(dep.getId()) == include) return;
        if(include) this.dependsOn[dep.getId()] = dep;
        else delete this.dependsOn[dep.getId()];
        dep.dependOnMe(this);
    }

    dependOnMe(dep, include) {
        include = include || (include === undefined);
        if(this.dependsOnMe.hasOwnProperty(dep.getId()) == include) return;
        if(include) this.dependsOnMe[dep.getId()] = dep;
        else delete this.dependsOnMe[dep.getId()];
        dep.dependOn(this);
    }

    isResolved() {
        return this.resolved;
    }

    check(recur) {
        this.resolved = true;
        for(let id in this.dependsOn) {
            let dep = this.dependsOn[id];
            if(recur) dep.check(true);
            if(!dep.isResolved()) {
                this.resolved = false;
                break;
            }
        }
        if(this.isResolved()) this.propagate();
    }

    resolve(dep) {
        check();
    }

    propagate() {
        for(let id in this.dependsOnMe) {
            let dep = this.dependsOnMe[id];
            dep.resolve(this);
        }
    }

    addChild(name, value) {
        if(value === undefined) value = Dependency;
        let child = value;
        if(typeof value === 'function')
            child = new value();
        if(child instanceof Part)
            child = child.getData();
        if(!(child instanceof Dependency)) return false;
        this.children[name] = child;
        this.dependOn(child);
        return child;
    }

    getChild(name) {
        return this.children[name];
    }

    getField(path) {
        if(!path) return this;
        let re = /[A-Za-z]+/g, name = re.exec(path);
        if(!name) return null;
        let child = this.getChild(name);
        if(!child) return null;
        return child.getField(path.substring(re.lastIndex));
    }

    getValue(path) {
        let field = this.getField(path);
        if(!field) return null;
        return field.value;
    }

    setValue(path, value) {
        if(value === undefined) {
            value = path;
            path = undefined;
        }
        let field = this.getField(path);
        if(!field) return false;
        field.value = value;
        return true;
    }

    eachLeaf(callback, path) {
        if(typeof path !== 'string') path = '';
        if(this.children.length === 0)
            callback.call(this, path);
        $.each(this.children, function(name, child) {
            child.eachLeaf(callback, path + '.' + name);
        });
    }
}

Dependency.nextId = 1;
Dependency.record = {};


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


class Scope {
    constructor(parent, variables, commands) {
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
        return this.data;
    }

    addVariable(name, value) {
        this.data.addChild(name, value);
    }

    getVariable(name) {
        let variable = this.data.getChild(name);
        if(variable) return variable;
        if(this.parent) return this.parent.getVariable(name);
        return null;
    }

    getField(path) {
        return this.data.getField(path);
    }

    compile() {
        let self = this, prevCommand = null;
        self.commands.forEach(function(commandStr) {
            if(!commandStr) return;
            let command = new Command(self, commandStr);
            command.parse();
            if(prevCommand) command.dependOn(prevCommand);
            prevCommand = command;
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
        this.referenceResolved = [];
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
        this.referenceResolved.push(false);
        this.index = index + reference.length;
        this.dependOn(reference);
    }

    allReferencesResolved() {
        for(let i = 0; i < self.references.length; i++) {
            if(!this.twoWay && i == 0) continue;
            let resolved = self.referenceResolved[i];
            if(this.twoWay && resolved) return true;
            if(!this.twoWay && !resolved) return false;
        }
        return !this.twoWay;
    }

    identifySubFields() {
        let self = this;
        self.subFields = [];
        self.references[0].eachLeaf(function(path) {
            for(let i = 1; i < self.references.length; i++) {
                let otherRef = self.references[i];
                if(otherRef.hasField(path)) self.subFields.push(path);
            }
        });
    }

    resolve(dep) {
        let self = this, index = self.references.indexOf(dep);
        if(dep instanceof Reference) {
            if(index >= 0) {
                self.references.splice(index, 1, dep.getField());
                let read = self.twoWay || index > 0,
                    edit = self.twoWay || index == 0;
                if(read) self.dependOn(dep.getField());
                if(edit) self.dependOnMe(dep.getField());
            }
        } else {
            self.referenceResolved[index] = true;
            if(!self.allReferencesResolved()) return;
            self.identifySubFields();
            self.subFields.forEach(function(sub) {
                if(self.twoWay) {
                    let edit = self.references[(index+1)%2].getField(sub),
                        read = self.references[index].getField(sub);
                    edit.setValue(read.getValue());
                    edit.resolve(read);
                } else {
                    let edit = self.references[0].getField(sub), value = edit.getValue(), expr = 'value';
                    for(let i = 1; i < self.arr.length; i++) {
                        let piece = self.arr[i];
                        if(typeof piece === 'string') expr += ' ' + piece;
                        else if(typeof piece === 'number') expr += ' ' + self.references[piece].getField(sub).getValue();
                    }
                    eval(expr);
                    edit.setValue(value);
                }
            });
        }
    }
}


class Reference extends Dependency {
    constructor(field, read, edit) {
        super();
        this.field = field;
        this.read = read;
        this.edit = edit;
        this.parsed = false;
        this.arr = [];
        this.index = 0;
        this.len = 0;
    }

    addPiece(piece) {
        this.arr.push(piece);
        if(piece instanceof Reference) self.dependOn(piece);
    }

    check() {
        let self = this, i = 0;
        for(i = self.index; i < self.arr.length; i++) {
            let piece = self.arr[i];
            if(typeof piece === 'string')
                self.field = self.field.getField(piece);
            else if(piece instanceof Reference && piece.isResolved())
                self.field = self.field.getChild(piece.getValue());
            else break;
        }
        self.index = i;
        super.check();
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



class Drawable extends Dependency {
    constructor() {
        super();
    }
    draw(context) {}
}

class Point extends Drawable {
    constructor() {
        super();
        this.addChild('x');
        this.addChild('y');
    }

    draw(context) {

    }
}

class Circle extends Drawable {

    constructor() {
        super();
        this.addChild('center', Point);
        this.addChild('radius');
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







