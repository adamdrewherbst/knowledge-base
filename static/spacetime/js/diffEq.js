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
    {coeff: -2, a: {0: 1, 2: 1}, c: {0: 2, 1: 2}}//*/
]

let fns = ['a', 'c'];

let coefficients = {
    a: {
        0: 1
    },
    c: {
        1: 1
    }
};

let period = 1, sinAmplitude = 1,
    sigma = 0.2, spikeAmplitude = -10;


$(function() {

    for(let i = 1; i < 70; i += 2) {
        let sin = sinAmplitude * Math.pow(-1, (i-1)/2) / (factorial(i) * Math.pow(period, i)),
            gaussian = spikeAmplitude * Math.pow(-1, (i-1)/2) / (factorial((i-1)/2) * Math.pow(sigma, i-1));
        coefficients['c'][i] = 0;
        //coefficients['c'][i] += sin;
        coefficients['c'][i] += gaussian;
    }
    console.log('c = ' + JSON.stringify(coefficients['c']));
    coefficients['a'][2] = coefficients['c'][3] * 9/7;

    displayEquation(equation);
    taylorSeries();

    printFunction('a');
    printFunction('c');
});


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

    for(let i = 4; i <= 20; i += 2) {
        let exp = getExpansion(i);
        //displayEquation(exp, true);
        let found = false;
        if(exp.length == 2) {
            for(let j = 0; j < 2; j++) {
                if(Object.keys(exp[j].a).length == 1 && Object.keys(exp[(j+1)%2].a).length == 0) {
                    found = true;
                    let n = Object.keys(exp[j].a)[0];
                    coefficients['a'][n] = -exp[(j+1)%2].coeff / exp[j].coeff;
                    displayMath('a_{' + n + '} = ' + coefficients['a'][n]);
                }
            }
        }
        if(!found && exp.length > 1) {
            display("Couldn't solve term " + i);
            break;
        }
    }
    MathJax.typeset();
}

function displayMath(math) {
    display('\\(' + math + '\\)');
}
function display(str) {
    $('#equations').append('<div class="equation">' + str + '</div>');
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
            str += '' + term.coeff;
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








