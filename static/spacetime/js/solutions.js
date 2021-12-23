class Matrix {
    constructor(data) {
        this.rows = data.length;
        this.cols = data[0].length;
        this.m = data;
        this.inv = Matrix.array(this.rows, this.cols);
    }

    invert() {
        if(this.rows != this.cols) return;
        let det = Matrix.determinant(this.m);
        if(det == 0) return;
        for(let i = 0; i < this.rows; i++) {
            for(let j = 0; j < this.cols; j++) {
                this.inv[j][i] = Matrix.determinant(Matrix.comatrix(this.m, i, j)) / det;
            }
        }
    }


    static determinant(m) {
        let det = 0;
        if(m.length == 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
        let k = 1;
        for(let i = 0; i < m.length; i++) {
            det += k * Matrix.determinant(Matrix.comatrix(m, 0, i));
            k = -k;
        }
        return det;
    }


}


function matrix(r, c) {
    return Array.from({length: r}, (v,i) => Array.from({length: c}, (v,i) => 0));
}

function product(a, b) {
    if(a[0].length != b.length) return null;
    let p = matrix(a.length, b[0].length);
    for(let i = 0; i < a.length; i++) {
        for(let j = 0; j < b[0].length; j++) {
            for(let k = 0; k < b.length; k++) {
                p[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    return p;
}

const determinant = m =>
    m.length == 1 ?
    m[0][0] :
    m.length == 2 ?
    m[0][0]*m[1][1]-m[0][1]*m[1][0] :
    m[0].reduce((r,e,i) =>
        r+(-1)**(i+2)*e*determinant(m.slice(1).map(c =>
            c.filter((_,j) => i != j))),0)

function invert(m, inv) {
    let r = m.length, c = m[0].length;
    if(r != c) return null;
    let det = determinant(m);
    if(det == 0) return null;
    if(!inv) inv = matrix(r, r);
    for(let i = 0; i < r; i++) {
        for(let j = 0; j < r; j++) {
            inv[j][i] = (-1)**(i+j) * determinant(comatrix(m, i, j)) / det;
        }
    }
    return inv;
}

function comatrix(m, rExc, cExc) {
    let rows = m.length, cols = m[0].length, n = matrix(rows-1, cols-1),
        r = 0, c = 0;
    for(let i = 0; i < rows; i++) {
        if(i == rExc) continue;
        c = 0;
        for(let j = 0; j < cols; j++) {
            if(j == cExc) continue;
            n[r][c++] = m[i][j];
        }
        r++;
    }
    return n;
}


function factorial(n) {
    let f = 1;
    for(let i = 2; i <= n; i++) {
        f *= i;
    }
    return f;
}




let equation = [
    {coeff: 1, a: {1: 1}},
    {coeff: -1, a: {0: 1}}
],
fns = ['a'],
order = getOrder(equation);

let x0 = 0, xf = 1, n = 100, sample = 5;
let dx = (xf - x0) / n;

let x = Array.from({length: n}, (v,i) => x0 + i*dx);
let y = {
    a: Array.from({length: n}, (v,i) => 0),
    a_true: Array.from({length: n}, (v,i) => 0)
};

let gradient = {
    a: Array.from({length: n}, (v,i) => 0)
};
let Mx = matrix(sample, sample), Mx_inv = matrix(sample, sample);


function getOrder(eq) {
    let order = {};
    eachFactor(eq, function(term, fn, derivative, power) {
        if(!order.hasOwnProperty(fn) || order[fn] < derivative)
            order[fn] = derivative;
    });
    return order;
}

function eachFactor(eq, callback) {
    for(let i = 0; i < eq.length; i++) {
        let term = eq[i];
        for(let fn of fns) {
            for(let derivative in term[fn]) {
                callback.call(term, i, fn, parseInt(derivative), term[fn][derivative]);
            }
        }
    }
}

function calcGradient() {
    for(let fn in order)
        for(let i = 0; i < n; i++)
            gradient[fn][i] = 0;
    for(let i = 0; i < n; i++) {
        calcPoint(i);
    }
}

function zeros(num) {
    return Array.from({length: num}, (v,i) => 0);
}
function zeroOut(arr) {
    for(let i = 0; i < arr.length; i++) {
        if(Array.isArray(arr[i]))
            zeroOut(arr[i]);
        else arr[i] = 0;
    }
}


let derivatives = Array.from({length: n}, function(v,i) {
        let d = {};
        for(let fn in order) d[fn] = zeros(order[fn]);
        return d;
    }),
    penalty = zeros(n), termPenalty = [];

let dPenalty = {};
for(let fn in order) {
    dPenalty[fn] = zeros(order[fn]);
}

function calcPoint(p) {

    let offset = Math.floor(sample/2);
    let start = p - offset;
    if(p < offset) start += offset-p;
    else if(p >= n-offset) start -= p - (n-offset) + 1;
    let end = start + sample - 1;

    for(let q = start, i = 0; q <= end; q++) {
        Mx[i][0] = 1;
        for(let j = 1; j < sample; j++) {
            if(q == p) Mx[i][j] = 0;
            else Mx[i][j] = (x[q] - x[p]) ** (j);
        }
        i++;
    }
    invert(Mx, Mx_inv);

    for(let fn in order) {
        for(let i = 1; i <= order[fn]; i++) {
            derivatives[p][fn][i] = 0;
            dPenalty[fn][i] = 0;
            for(let q = start, j = 0; q <= end; q++) {
                derivatives[p][fn][i] += Mx_inv[i][j++] * (y[fn][q] - y[fn][p]);
            }
            derivatives[p][fn][i] *= factorial(i);
        }
        derivatives[p][fn][0] = y[fn][p];
    }

    //get the current penalty value for this point

    for(let i = 0; i < equation.length; i++) termPenalty[i] = equation[i].coeff;
    eachFactor(equation, function(term, fn, derivative, power) {
        termPenalty[term] *= derivatives[p][fn][derivative] ** power;
    });
    penalty[p] = termPenalty.reduce((r,e,i) => r + e);

    //get the dependence of the penalty on each derivative

    eachFactor(equation, function(t, fn, derivative, power) {
        let term = equation[t], dTerm = JSON.parse(JSON.stringify(term));
        if(power == 1) {
            delete dTerm[fn][derivative];
        } else {
            dTerm[fn][derivative]--;
            dTerm.coeff *= power;
        }
        let val = dTerm.coeff;
        for(let f in order) {
            for(let derivative in dTerm[f]) {
                val *= derivatives[p][f][derivative] ** dTerm[f][derivative];
            }
        }
        dPenalty[fn][derivative] += val;
    });

    for(let fn in order) {
        for(let i = 0; i <= order[fn]; i++) {
            let fact = factorial(i);
            for(let q = start, j = 0; q <= end; q++) {
                gradient[fn][q] += penalty[p] * dPenalty[fn][i] * Mx_inv[i][j++] * fact;
            }
        }
    }
}


function updateY(dt = 0.0001) {
    for(let fn in order) {
        for(let i = 0; i < n; i++) {
            y[fn][i] -= gradient[fn][i] * dt;
        }
        graphFunction(fn, fn);
    }
}



function graphFunction(fn, graph) {
    let canvas = document.getElementById('graph-' + graph),
        ctx = canvas.getContext('2d');
    if(!ctx) return;

    let yVal = y[fn], yTrue = y[fn+'_true'], yMin = Infinity, yMax = -Infinity;

    for(let i = 0; i < n; i++) {
        if(yTrue[i] > yMax) yMax = yTrue[i];
        if(yTrue[i] < yMin) yMin = yTrue[i];
    }
    let yRange = yMax - yMin;
    let xo = 0, yo = 50 + (canvas.height-100) * yMax / yRange;
    let yScale = (canvas.height-100) / yRange;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.moveTo(xo, yo - y[0]*yScale);
    ctx.beginPath();
    ctx.strokeStyle = '#f00';
    ctx.setLineDash([]);
    for(let i = 0; i < n; i++) {
        if(isNaN(yVal[i]) || yVal[i] > yMax + 0.5 * yRange  || yVal[i] < yMin - 0.5 * yRange) continue;
        ctx.lineTo((i/n)*canvas.width, yo - yVal[i] * yScale);
    }
    ctx.stroke();

    ctx.moveTo(xo, yo - yTrue[0]*yScale);
    ctx.beginPath();
    ctx.strokeStyle = '#0f0';
    ctx.setLineDash([5, 5]);
    for(let i = 0; i < n; i++) {
        ctx.lineTo((i/n)*canvas.width, yo - yTrue[i]*yScale);
    }
    ctx.stroke();

    console.log(y);
}



function graphAll() {
    for(let fn in order) {
        graphFunction(fn, fn);
    }
}

function reset() {
    for(let i = 0; i < n; i++) {
        y.a[i] = Math.exp(x[i]) + 0.2 * Math.sin(x[i]);
        y.a_true[i] = Math.exp(x[i]);
        for(let fn in order) {
            gradient[fn][i] = 0;
            for(let j = 0; j < order[fn]; j++) {
                derivatives[i][fn][j] = 0;
            }
        }
        penalty[i] = 0;
    }
    graphAll();
}

function say(data) {
    return JSON.stringify(data);
}

$(function() {
    reset();
});







