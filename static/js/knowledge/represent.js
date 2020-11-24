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
        if(include) this.dependsOn[dep.getId()] = dep;
        else delete this.dependsOn[dep.getId()];
    }

    dependOnMe(dep, include) {
        include = include || (include === undefined);
        if(include) this.dependsOnMe[dep.getId()] = dep;
        else delete this.dependsOnMe[dep.getId()];
    }

    isResolved(check) {
        if(check) return this.check(true);
        return this.resolved;
    }

    check(recur) {
        for(let id in this.dependsOn) {
            let dep = this.dependsOn[id];
            if(!dep.resolved(recur)) return false;
        }
        return true;
    }

    resolve(dep) {
        check();
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
                path.forEach(function(id, i) {
                    map.from[ids[i]] = id;
                    map.to[id] = ids[i];
                });
                self.addPathMap(map, pathInd);
            }, {
                dynamic: true,
                returnType: 'ids'
            });
        });
    }

    addPathMap(map, pathInd) {
        let self = this;
        map.paths = {pathInd: true};
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
        for(let i = 0; i < this.nextId; i++) {
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
                this.data.addChild(name, variables[name]);
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

    addVariable(name, value) {
        this.data.addChild(name, value);
    }

    getVariable(name) {
        let variable = this.data.getChild(name);
        if(variable) return variable;
        if(this.parent) return this.parent.getVariable(name);
        return null;
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
                if(reference) this.addReference(reference);
                else if(!this.operator) this.setOperator(token);
            }
        }
        if(this.index < this.str.length)
            this.arr.push(this.str.substring(this.index, this.str.length));
    }

    setOperator(operator) {
        this.operator = operator;
        if(operator == '<=>') {
            this.twoWay = true;
        }
    }

    addReference(reference, index, length) {
        if(!reference) return;
        if(index > this.index)
            this.arr.push(this.str.substring(this.index, index));
        this.arr.push(reference);
        this.index = index + length;
        this.dependOn(reference);
    }

    resolve(dep) {
        super.resolve(dep);
        if(this.resolved) {
        }
    }
}


class Reference extends Dependency {
    constructor(field) {
        super();
        this.field = field;
        this.parsed = false;
        this.arr = [];
        this.index = 0;
        this.len = 0;
    }

    addPiece(piece) {
        this.arr.push(piece);
        if(piece instanceof Reference) self.dependOn(piece);
        this.checkChain();
        return this.field ? true : false;
    }

    checkChain() {
        let self = this, i = 0;
        for(i = self.index; i < self.arr.length; i++) {
            let piece = self.arr[i];
            if(typeof piece === 'string')
                self.field = self.field.getChild(piece);
            else if(piece instanceof Reference && piece.isResolved())
                self.field = self.field.getChild(piece.getValue());
            else break;
        }
        self.index = i;
        if(self.parsed && self.index == self.arr.length) {
            self.dependOn(self.field);
        }
    }

    resolve(dep) {
        let self = this;
        if(dep === self.field) {
            self.setValue(self.field.getValue());
            self.propagate();
        } else if(self.arr.indexOf(dep) >= 0) {
            self.checkChain();
        }
    }

    static parse(str, scope) {

        //determine which part is referred to
        let first = str.match(/^[A-Za-z]+/), root = null, offset = 0;
        if(!first) return false;
        let variable = scope.getVariable(first[0]);
        if(variable) {
            root = variable;
            str = str.substring(first[0].length);
            offset = first[0].length;
        } else {
            root = scope.getThis();
            str = '.' + str;
            offset = -1;
        }

        let ref = new Reference();

        let re = /\.([A-Za-z]+)/g, match = null;
        while((match = re.exec(str)) !== null) {

            if(!ref.addPiece(match[1])) return false;

            let nextIndex = re.lastIndex;
            if(nextIndex < str.length) {
                if(str[nextIndex] === '[')  {
                    let nested = Reference.parse(str.substring(nextIndex+1), scope);
                    if(!nested) return false;
                    ref.addPiece(nested);
                    re.lastIndex = nextIndex + 1 + nested.len + 1;
                } else if(str[nextIndex] === ']') {
                    break;
                } else if(str[nextIndex] !== '.') {
                    return false;
                }
            }
        }

        ref.len = re.lastIndex + offset;
        ref.parsed = true;
        ref.checkChain();
        return ref;
    }
}


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
    return this.data;
};


Part.prototype.parseCommands = function() {
    let self = this;
    self.scope = new Scope();

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







