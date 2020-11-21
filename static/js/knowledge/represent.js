class Drawable {
    constructor() {}
    draw(context) {}
}

class Circle {

    constructor(center, radius) {
        this.setCenter(center);
        this.setRadius(radius);
    }

    setCenter(center) {
        this.center = center;
    }
    getCenter() {
        return this.center;
    }
    setRadius(radius) {
        this.radius = radius;
    }
    getRadius() {
        return this.radius;
    }
    draw(context) {
        context.drawCircle(this.center.x, this.center.y, this.radius);
    }
}

Drawable.instances = {Circle: Circle};


class Dependency {
    constructor() {
        this.id = Dependency.nextId++;
        this.resolved = true;
        this.dependsOn = {};
        this.dependsOnMe = {};
        this.children = {};
    }

    static nextId = 1;

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

    addChild(child) {
        this.children[child.getId()] = child;
        this.dependOn(child);
    }
}


class Scope {
    constructor(part, paths) {
        this.part = part;
        this.paths = paths;
        this.nextId = 1;
        this.maps = [];
        this.variables = {};
        this.commands = [];
    }

    map() {
        let self = this, re = /[^<>]/;
        self.paths.forEach(function(pathStr, pathInd) {

            //parse the path string into an array and give ID's to its parts
            let index = 0, match = null, direction = null, chain = [], ids = [];
            while((match = re.exec(pathStr)) !== null) {

                //first parse the direction indicator
                if(match.index > 0) {
                    let dir = pathStr[match.index-1];
                    if(dir !== direction) {
                        direction = dir;
                        chain.push(direction);
                    }
                }

                //then the concept and/or variable name
                let part = str.match(/^([A-Za-z]+)(?::([A-Za-z]+))?/);
                if(part[1] in self.variables) {
                    let variable = self.variables[part[1]];
                    chain.push(variable.concept);
                    ids.push(variable.id);
                } else {
                    let concept = part[1], variable = part[2], id = self.nextId++;
                    chain.push(concept);
                    ids.push(id);
                    if(variable) {
                        self.variables[variable] = {id: id, concept: concept};
                    }
                }
            }

            //listen for the path on our part
            self.part.on(chain, function(path) {

                //when found, make a map of it
                let map = {from: {}, to: {}};
                path.forEach(function(id, i) {
                    map.from[ids[i]] = id;
                    map.to[id] = ids[i];
                });
                self.addPathMap(map, pathInd);
            }, {
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
                to: Object.assign({}, map.to, other.to)
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
            this.compile();
        }
    }

    compile(map) {
        let self = this, prevCommand = null;
        self.commands.forEach(function(commandStr) {
            let command = new Command(self, commandStr);
            command.parse();
            if(prevCommand) command.dependOn(prevCommand);
            prevCommand = command;
        });
    }
}


class Command {
    constructor(scope, str) {
        this.scope = scope;
        this.str = str;
        this.index = 0;
        this.editing = null;
        this.operator = null;
        this.references = {};
        this.arr = [];
    }

    parse() {
        let reToken = /[^\s]+/, inString = false;
        while((match = reToken.exec(this.str)) !== null) {
            let token = match[0], first = token[0], last = token[token.length-1];
            if(inString && last === inString) inString = false;
            else if(first === "'" || first === '"') inString = first;
            else this.addReference(Reference.parse(token));
        }
        if(this.index < this.str.length)
            this.arr.push(this.str.substring(this.index, this.str.length));
    }

    addReference(reference, index, length) {
        if(!reference) return;
        if(index > this.index)
            this.arr.push(this.str.substring(this.index, index));
        this.arr.push(reference);
        this.index = index + length;
        this.dependOn(reference);
    }
}


class Reference {
    constructor(str, start) {
        this.str = str;
        this.field = null;
    }

    static parse(str) {

        let refPart = Reference.regex.part.exec(this.str),
            chainMatch = null;

        while((chainMatch = Reference.regex.chain.exec(this.str)) !== null) {

            let chainStr = chainMatch[0],
                toThis = chainMatch[1] === 'this',
                partMatch = null,
                chain = [];

            while((partMatch = Reference.regex.part.exec(chainStr)) !== null) {

                let concept = partMatch[1],
                    variable = partMatch[2],
                    direction = partMatch[3];

                if(toThis) {
                    if(concept === 'this') continue;
                    chain.unshift(Part.getOppositeDirection(direction));
                    if(variable) chain.unshift(variable);
                    chain.unshift(concept);
                } else {
                    if(chainArr.length == 0) chain.push(direction);
                    chain.push(concept);
                    if(variable) chain.push(variable);
                    chain.push(direction);
                }
            }

            if(toThis) {
                chain.push(refPart[1]);
                this.setPrimaryChain(chain);
            } else {
                chain.unshift(refPart[1]);
                this.addChain(chain);
            }
        }
    }

    setPrimaryChain(chain) {
        this.primaryChain = chain;
    }

    addChain(chain) {
        this.chains.push(chain);
    }

    static parse(command) {
        while((refMatch = Reference.regex.main.exec(command.getString())) !== null) {
            let refStr = refMatch[0],
                reference = new Reference(refStr, refMatch.index);
            reference.parse();
            command.addReference(reference);
        }
    }
}


Part.prototype.parseCommands = function() {
    let self = this;
    self.data = {};

    self.commands.forEach(function(commandStr) {
        let arr = commandStr.split(/\s+/);

        //define a drawable primitive
        if(arr[0] in Drawable.instances) {
            self.data[arr[1]] = new Drawable.instances[arr[0]]();
            return;
        }

        //default case: assign/modify a data field
        let command = new Command();

        let refMatch = null;
        while((refMatch = Part.regex.reference.exec(commandStr)) !== null) {

            let reference = new Reference(command);
            reference.parse();
            command.addReference(reference, refMatch.index, refMatch[0].length);

            let ref = command.substring(refMatch.index, refMatch.index + refMatch[0].length),
                refPart = Part.regex.part.exec(ref),
                chainMatch = null;

            while((chainMatch = Part.regex.chain.exec(ref)) !== null) {

                let chain = chainMatch[0],
                    toThis = chainMatch[1] === 'this',
                    partMatch = null,
                    chainArr = [];

                while((partMatch = Part.regex.part.exec(chain)) !== null) {

                    let concept = partMatch[1],
                        variable = partMatch[2],
                        direction = partMatch[3];

                    if(toThis) {
                        if(concept === 'this') continue;
                        chainArr.unshift(Part.getOppositeDirection(direction));
                        if(variable) chainArr.unshift(variable);
                        chainArr.unshift(concept);
                    } else {
                        if(chainArr.length == 0) chainArr.push(direction);
                        chainArr.push(concept);
                        if(variable) chainArr.push(variable);
                        chainArr.push(direction);
                    }
                }

                if(toThis) {
                    chainArr.push(refPart[1]);
                    reference.setPrimaryChain(chainArr);
                } else {
                    chainArr.unshift(refPart[1]);
                    reference.addChain(chainArr);
                }
            }
        }
    });
};

Part.buildRegex = function() {
    let alpha = '[A-Za-z]+',
        part = '(' + alpha + ')(:' + alpha + ')?([><])?',
        chain = '\.(?:' + part ')+',
        reference = part + '(?:' + chain + ')+';

    Part.regex = {
        alpha: new RegExp(alpha),
        part: new RegExp(part),
        chain: new RegExp(chain),
        reference: new RegExp(reference)
    };
};

Part.









