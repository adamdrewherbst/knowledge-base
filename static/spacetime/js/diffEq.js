let equation = [
    {coeff: 1, a: {2: 2}, c: {0: 4}},
    {coeff: 2, a: {1: 2}, c: {0: 2, 1: 2}},
    {coeff: 2, a: {0: 2}, c: {0: 2, 2: 2}},
    {coeff: 1, a: {0: 2}, c: {}},
    {coeff: -2, a: {0: 2}, c: {1: 2}},
    {coeff: 1, a: {0: 2}, c: {1: 4}},
    {coeff: 4, a: {1: 1, 2: 1}, c: {0: 3, 1: 1}},
    {coeff: -8, a: {0: 1, 1: 1}, c: {0: 2, 1: 1, 2: 1}},
    {coeff: 2, a: {0: 1, 2: 1}, c: {0: 2}},
    {coeff: -2, a: {0: 1, 2: 1}, c: {0: 2, 1: 2}}
]//*/


/*let equation = [
    {coeff: -1, c: {4: 1, 2: 1, 1: 1, 0: 3}},
    {coeff: 1, c: {4: 1, 1: 3, 0: 2}},
    {coeff: -1, c: {4: 1, 1: 1, 0: 2}},
    {coeff: 1, c: {3: 2, 1: 1, 0: 3}},
    {coeff: 1, c: {3: 1, 2: 2, 0: 3}},
    {coeff: -4, c: {3: 1, 2: 1, 1: 2, 0: 2}},
    {coeff: 1, c: {3: 1, 1: 4, 0: 1}},
    {coeff: -1, c: {3: 1, 1: 2, 0: 1}},
    {coeff: 1, c: {3: 1, 2: 1, 0: 2}},
    {coeff: 2, c: {2: 2, 1: 3, 0: 1}},
    {coeff: -1, c: {2: 1, 1: 5}},
    {coeff: 1, c: {2: 1, 1: 3}}
]//*/


let fns = ['a', 'c'];

let coefficients = {
    a: {
        0: 1
    },
    c: {
        1: 1
        //3: -1/6,
        //5: 1/120
    }
};

let alpha = 4,
    sigma = 1, spikeAmplitude = 0;
let hasSin = true, hasGauss = true;
let numCoeffs = 200,
    taylorOrder = 60;


$(function() {

    for(let i = 1; i < numCoeffs; i += 2) {
        let sin = alpha * (Math.pow(-1, (i-1)/2) / (factorial(i) * Math.pow(alpha, i))),
            gaussian = spikeAmplitude * Math.pow(-1, (i-1)/2) / (factorial((i-1)/2) * Math.pow(sigma, i-1));
        coefficients['c'][i] = 0;
        if(hasSin) coefficients['c'][i] += sin;
        if(hasGauss) coefficients['c'][i] += gaussian;
    }
    coefficients['a'][2] = coefficients['c'][3] * 3;//*/

    displayEquation(equation);
    display('');
    taylorSeries();
    MathJax.typeset();

    graphFunction('a');
    graphFunction('c');

    printFunction('c');
    printFunction('a');
});


function graphFunction(fn) {
    let canvas = document.getElementById('graph-' + fn),
        ctx = canvas.getContext('2d');
    if(!ctx) return;

    let n = canvas.width,
        y = Array.from({length: n}, (v,i) => 0),
        yTrue = Array.from({length: n}, (v,i) => 0);

    let x0 = 0;
    let xScale = hasSin ? canvas.width / (alpha * Math.PI/2) : canvas.width / (8 * sigma);

    let yMin = Infinity, yMax = -Infinity;

    for(let i = 0; i < n; i++) {
        let x = (i/n)*canvas.width / xScale;
        for(let j in coefficients[fn]) {
            let c = coefficients[fn][j];
            y[i] += c * Math.pow(x, j);
        }

        if(fn == 'c') {
            if(hasSin) yTrue[i] += alpha * Math.sin(x / alpha);
            if(hasGauss) yTrue[i] += spikeAmplitude * x * Math.exp(-Math.pow(x/sigma,2));
        } else {
            if(hasSin) yTrue[i] += Math.cos(x / alpha);
        }

        //if(y[i] > yMax) yMax = y[i];
        //if(y[i] < yMin) yMin = y[i];
        if(yTrue[i] > yMax) yMax = yTrue[i];
        if(yTrue[i] < yMin) yMin = yTrue[i];
    }
    y0 = 50 + (canvas.height-100) * yMax / (yMax - yMin);
    let yScale = (canvas.height-100) / (yMax-yMin);

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.moveTo(x0, y0 - y[0]*yScale);
    ctx.beginPath();
    ctx.strokeStyle = '#f00';
    ctx.setLineDash([]);
    for(let i = 0; i < n; i++) {
        if(isNaN(y[i]) || y[i] > yMax || y[i] < yMin) break;
        ctx.lineTo((i/n)*canvas.width, y0 - y[i] * yScale);
    }
    ctx.stroke();

    ctx.moveTo(x0, y0 - yTrue[0]*yScale);
    ctx.beginPath();
    ctx.strokeStyle = '#0f0';
    ctx.setLineDash([5, 5]);
    for(let i = 0; i < n; i++) {
        ctx.lineTo((i/n)*canvas.width, y0 - yTrue[i]*yScale);
    }
    ctx.stroke();

    console.log(y);
}


function printFunction(fn) {
    let str = '';
    for(let i = 0; i < 100; i++) {
        if(coefficients[fn].hasOwnProperty(i)) {
            coeffStr = '' + coefficients[fn][i];
            coeffStr = coeffStr.replace(/e([\+\-])(\d+)/, function(a, b, c) {
                return '*10^{' + (b == '-' ? b : '') + c + '}';
            });
            if(str.length > 0 && coefficients[fn][i] > 0)
                str += '+';
            str += coeffStr + 'x^{' + i + '}';
        }
    }
    console.log(str);
}

function taylorSeries() {
    let eq = equation, exp = evaluate(eq);
    //console.log('final exp: ' + JSON.stringify(exp));
    /*displayEquation(exp, true)
    for(let i = 0; i < 8; i++) {
        eq = removeFactor(derivative(eq))
        exp = removeFactor(evaluate(eq))
        displayEquation(exp, true);
    }//*/

    for(let i = 4; i < taylorOrder; i++) {
        let exp = getExpansion(i);
        /*let onlyC = [];
        for(let term of exp) {
            let newTerm = {coeff: term.coeff, a: {}, c: {}};
            for(let order in term.c) newTerm.c[order] = term.c[order];
            for(let order in term.a) {
                order = parseInt(order);
                if(!newTerm.c.hasOwnProperty(order+1)) newTerm.c[order+1] = term.a[order];
                else newTerm.c[order+1] += term.a[order];
                newTerm.coeff *= Math.pow(order+1, term.a[order]);
            }
            addTerm(newTerm, onlyC);
        }
        simp = removeFactor(removeZeros(onlyC));//*/
        displayMath('r^{'+i+'}: ', false);
        displayEquation(exp, true);
        //displayEquation(onlyC, true);
        //display('');
        let found = false;
        let f = 'a';
        if(exp.length == 2) {
            for(let j = 0; j < 2; j++) {
                if(Object.keys(exp[j][f]).length == 1 && Object.keys(exp[(j+1)%2][f]).length == 0) {
                    found = true;
                    let n = Object.keys(exp[j][f])[0];
                    coefficients[f][n] = -exp[(j+1)%2].coeff / exp[j].coeff;
                    displayMath(f + '_{' + n + '} = ' + coefficients[f][n]);
                }
            }
        }
        if(!found && exp.length > 1) {
            display("Couldn't solve term " + i);
            break;
        }//*/
    }
    MathJax.typeset();
}

function displayMath(math) {
    display('\\(' + math + '\\)');
}
function display(str, newline) {
    if(newline === undefined) newline = true;
    $('#equations').append('<div class="equation' + (newline ? ' newline' : ' inline') + '">' + str + '</div>');
}

function printExpansion(power) {
    displayEquation(getExpansion(power), true);
    MathJax.typeset();
}

function getExpansion(power) {
    let exp = [];
    for(let i = 0; i < equation.length; i++) {
        let term = equation[i];
        //console.log('doing term ' + i + ': ' + JSON.stringify(term));
        getTermExpansion(term, power, exp);
    }
    return removeFactor(removeZeros(exp));
}

function getTermExpansion(term, power, exp) {
    if(!exp) exp = [];
    let minPower = 0, powers = [];
    for(let fn of fns) {
        for(let order in term[fn]) {
            order = parseInt(order);
            let pow = term[fn][order],
                p = (fn == 'a' && order%2 == 1) || (fn == 'c' && order%2 == 0) ? 1 : 0;
            minPower += p * pow;
            powers.push(pow);
        }
    }
    let diff = (power - minPower) / 2;

    //console.log('distributing power of ' + diff);

    eachSplit(diff, powers, function(split) {
        //console.log(JSON.stringify(split));
        let newTerm = {coeff: term.coeff, a: {}, c: {}};
        let i = 0;
        for(let fn of fns) {
            for(let order in term[fn]) {
                order = parseInt(order);
                let pow = term[fn][order], remaining = pow, factorSplit = split[i++];
                for(let j = 0; j < factorSplit.length; j++) {
                    let addPower = factorSplit[j] * 2, multiplicity = 1;
                    while(j+1 < factorSplit.length && factorSplit[j+1] == factorSplit[j]) {
                        multiplicity++;
                        j++;
                    }
                    let n = (fn == 'a' && order%2 == 0 || fn == 'c' && order%2 == 1 ? 0 : 1) + addPower + order;
                    //console.log('for ' + fn + '_' + n + ' have multiplicity ' + multiplicity);
                    if((fn == 'a' && n%2 == 1) || (fn == 'c' && n%2 == 0)) return;

                    newTerm.coeff *= choose(remaining, multiplicity);
                    remaining -= multiplicity;
                    for(let k = 0; k < order; k++) newTerm.coeff *= Math.pow(n-k, multiplicity);
                    if(n > 1) {
                        if(coefficients[fn].hasOwnProperty(n)) newTerm.coeff *= Math.pow(coefficients[fn][n], multiplicity);
                        else if(!newTerm[fn].hasOwnProperty(n)) newTerm[fn][n] = multiplicity;
                        else newTerm[fn][n] += multiplicity;
                    }
                }
            }
        }
        //console.log(JSON.stringify(newTerm));
        addTerm(newTerm, exp);
    });
    return exp;
}

function choose(n, k) {
    let c = 1;
    for(let i = 0; i < k; i++) {
        c *= (n-i) / (k-i);
    }
    return c;
}


function eachSplit(n, groups, callback, split) {
    if(split === undefined) split = [];
    let remaining = groups.length - split.length;
    if(remaining == 0) {
        callback.call(split, split);
        return;
    }
    let min = remaining == 1 ? n : 0;
    for(let i = n; i >= min; i--) {
        eachGroup(i, groups[split.length], function(groupSplit) {
            split.push(groupSplit);
            eachSplit(n - i, groups, callback, split);
            split.pop();
        });
    }
}

function eachGroup(n, k, callback, split, max) {
    if(split === undefined) split = [];
    if(k < 1) {
        callback.call(split, split);
        return;
    }
    if(max === undefined) max = n;
    let min = k == 1 ? n : Math.ceil(n / k);
    for(let i = max; i >= min; i--) {
        split.push(i);
        eachGroup(n-i, k-1, callback, split, Math.min(i, n-i));
        split.pop();
    }
}



function evaluate(equation) {
    let exp = [];
    for(let term of equation) {
        let newTerm = evaluateTerm(term);
        if(newTerm) addTerm(newTerm, exp);
    }
    removeZeros(exp);
    return exp;
}

function evaluateTerm(term) {
    let newTerm = JSON.parse(JSON.stringify(term)), skip = false;
    for(let f of fns) {
        let fn = newTerm[f];
        for(let order in fn) {
            order = parseInt(order);
            if((f == 'a' && order % 2 == 1) || (f == 'c' && order % 2 == 0)) {
                return null;
            }
            if(order < 2) {
                delete fn[order];
            } else {
                let power = fn[order], coeff = term.coeff;
                newTerm.coeff *= Math.pow(factorial(order), power);
            }
        }
    }
    //console.log('evaluated term ' + JSON.stringify(term) + ' to ' + JSON.stringify(newTerm));
    return newTerm;
}

function addTerm(term, exp) {
    let found = false;
    for(let eTerm of exp) {
        if(likeTerms(term, eTerm)) {
            eTerm.coeff += term.coeff;
            found = true;
            break;
        }
    }
    if(!found) exp.push(term);
}

function factorial(n) {
    let f = 1;
    for(let i = 1; i <= n; i++)
        f *= i;
    return f;
}

function derivative(equation) {
    let derivative = [];

    for(let term of equation) {

        for(let f of fns) {
            let fcn = term[f];

            for(let order in fcn) {

                order = parseInt(order);
                let newTerm = JSON.parse(JSON.stringify(term));
                let power = fcn[order];

                if(power == 1) {
                    delete newTerm[f][order];
                } else {
                    newTerm[f][order]--;
                    newTerm.coeff *= power;
                }
                if(!newTerm[f].hasOwnProperty([order+1]))
                    newTerm[f][order+1] = 1;
                else newTerm[f][order+1]++;

                addTerm(newTerm, derivative);
            }
        }
    }

    removeZeros(derivative);
    return derivative;
}

function removeFactor(exp) {
    let nums = [];
    for(let term of exp) {
        nums.push(Math.abs(term.coeff));
    }
    let gcf = findGCF(nums);
    if(gcf == 1) return exp;
    for(let term of exp) {
        term.coeff /= gcf;
    }
    return exp;
}

function findGCF(nums) {
    let gcf = 1, lists = [], index = {};
    for(let num of nums) {
        lists.push(factorList(num));
    }
    for(let i = 0; i < lists.length; i++) {
        for(let factor of lists[i]) {
            if(!index.hasOwnProperty(factor)) index[factor] = {};
            if(!index[factor].hasOwnProperty(i)) index[factor][i] = 1;
            else index[factor][i]++;
        }
    }
    for(let factor in index) {
        let common = true, min = Infinity;
        for(let i = 0; i < nums.length && common; i++) {
            if(!index[factor].hasOwnProperty(i)) {
                common = false;
            } else if(min > index[factor][i]) {
                min = index[factor][i];
            }
        }
        if(common) gcf *= Math.pow(factor, min);
    }
    //console.log('GCF of ' + JSON.stringify(nums) + ' is ' + gcf);
    return gcf;
}

function factorList(n) {
    let factors = [], found = false, lower = 2, upper = Math.floor(Math.sqrt(n));
    do {
        found = false;
        for(let i = lower; i <= upper && !found; i++) {
            if(n % i == 0) {
                factors.push(i);
                lower = i;
                n /= i;
                upper = Math.floor(Math.sqrt(n));
                found = true;
            }
        }
    } while(found);
    factors.push(n);
    return factors;
}

function removeZeros(exp) {
    for(let i = exp.length-1; i >= 0; i--) {
        if(exp[i].coeff == 0) exp.splice(i, 1);
    }
    return exp;
}

function likeTerms(term1, term2) {
    return objMatch(term1.a, term2.a) && objMatch(term1.c, term2.c);
}

function objMatch(obj1, obj2) {
    if(!obj1 || !obj2) return false;
    for(let p in obj1) {
        if(!obj2.hasOwnProperty(p) || obj2[p] != obj1[p]) return false;
    }
    for(let p in obj2) {
        if(!obj1.hasOwnProperty(p) || obj1[p] != obj2[p]) return false;
    }
    return true;
}

function displayEquation(equation, isEvaluated) {
    let str = '';
    for(let term of equation) {
        if(str.length > 0 && term.coeff > 0)
            str += '+';
        if(term.coeff != 1)
            str += '' + (term.coeff == -1 ? '-' : term.coeff);
        //console.log('printing term ' + isEvaluated + ': ' + JSON.stringify(term));
        for(let f of fns) {
            let fn = term[f];
            for(let order in fn) {
                let power = fn[order];
                str += '{' + f;
                if(isEvaluated) {
                    str += '_{' + order + '}}';
                } else {
                    for(let i = 0; i < order; i++)
                        str += "'";
                    str += '}';
                }
                if(power > 1)
                    str += '^' + power;
            }
        }
    }
    if(str == '') str = '0';
    displayMath(str);
}








