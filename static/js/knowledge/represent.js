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


class Command {
    constructor(str) {
        this.str = str;
        this.arr = [];
        this.index = 0;
    }

    parse() {
        let match = null;
        while((match = Reference.regex.main.exec(this.str)) !== null) {
            let reference = new Reference(this.str.substring(match.index, match.index + match[0].length));
            reference.parse();
            this.addReference(reference, refMatch.index, refMatch[0].length);
        }
        if(this.index < this.str.length)
            this.arr.push(this.str.substring(this.index, this.str.length));
    }

    addReference(reference, index, length) {
        if(index > this.index)
            this.arr.push(this.str.substring(this.index, index));
        this.arr.push(reference);
        this.index = index + length;
    }
}


class Reference {
    constructor(str) {
        this.str = str;
        this.primaryChain = null;
        this.chains = [];
    }

    parse() {
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









