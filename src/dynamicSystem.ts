
function vectorAdd(a: Float64Array, b: Float64Array): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
        result[i] = a[i] + b[i];
    }
    return result;
}

function vectorScale(a: Float64Array, scalar: number): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
        result[i] = a[i] * scalar;
    }
    return result;
}

function matrixMultiply(A: Float64Array[], B: Float64Array): Float64Array {
    const result = new Float64Array(A.length);
    for (let i = 0; i < A.length; i++) {
        result[i] = 0;
        for (let j = 0; j < B.length; j++) {
            result[i] += A[i][j] * B[j];
        }
    }
    return result;
}

function selectInputs(vector: Float64Array, indices: number[]): Float64Array {
    if (indices.length === 0) {
        return vector;
    }
    return new Float64Array(indices.map(i => vector[i]));
}

export class DynamicSystem {
    protected state: Float64Array;
    protected subsystems: DynamicSystem[] = [];
    protected directFeedthrough: boolean;

    constructor(
        public readonly id: string,
        protected f: (x: Float64Array, u: Float64Array, t: number) => Float64Array,
        protected g: (x: Float64Array, u: Float64Array, t: number) => Float64Array,
        directFeedthrough: boolean,
        initialState: Float64Array
    ) {
        this.state = initialState;
        this.directFeedthrough = directFeedthrough;
    }

    update(u: (t: number) => Float64Array, t: number, dt: number): void {
        const k1 = this.f(this.state, u(t), t);
        const k2 = this.f(vectorAdd(this.state, vectorScale(k1, dt / 2)), u(t + dt / 2), t + dt / 2);
        const k3 = this.f(vectorAdd(this.state, vectorScale(k2, dt / 2)), u(t + dt / 2), t + dt / 2);
        const k4 = this.f(vectorAdd(this.state, vectorScale(k3, dt)), u(t + dt), t + dt);

        const newState = vectorScale(
            vectorAdd(
                vectorAdd(k1, vectorScale(k2, 2)),
                vectorAdd(vectorScale(k3, 2), k4)
            ),
            dt / 6
        );

        this.state = vectorAdd(this.state, newState);
    }

    getOutput(u: Float64Array, t: number): Float64Array {
        return this.g(this.state, u, t);
    }

    getState(): Float64Array {
        return this.state;
    }

    setState(newState: Float64Array): void {
        this.state = newState;
    }

    getDimension(): number {
        return this.state.length;
    }

    getSubsystemState(id: string): Float64Array | null {
        if (this.id === id) {
            return this.state;
        }
        for (const subsystem of this.subsystems) {
            const state = subsystem.getSubsystemState(id);
            if (state !== null) {
                return state;
            }
        }
        return null;
    }

    static series(sys1: DynamicSystem, sys2: DynamicSystem): DynamicSystem {
        const id = `${sys1.id}_${sys2.id}_series`;
        const f = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            const y1 = sys1.g(x.slice(0, sys1.state.length), u, t);
            return new Float64Array([
                ...sys1.f(x.slice(0, sys1.state.length), u, t),
                ...sys2.f(x.slice(sys1.state.length), y1, t)
            ]);
        };

        const g = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            const y1 = sys1.g(x.slice(0, sys1.state.length), u, t);
            return sys2.g(x.slice(sys1.state.length), y1, t);
        };

        const initialState = new Float64Array([...sys1.state, ...sys2.state]);
        const directFeedthrough = sys1.directFeedthrough && sys2.directFeedthrough;
        const system = new DynamicSystem(id, f, g, directFeedthrough, initialState);
        system.subsystems = [sys1, sys2];
        return system;
    }

    // completely not tested
    static parallel(sys1: DynamicSystem, sys2: DynamicSystem): DynamicSystem {
        const id = `${sys1.id}_${sys2.id}_parallel`;
        const f = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            return new Float64Array([
                ...sys1.f(x.slice(0, sys1.state.length), u, t),
                ...sys2.f(x.slice(sys1.state.length), u, t)
            ]);
        };

        const g = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            return new Float64Array([
                ...sys1.g(x.slice(0, sys1.state.length), u, t),
                ...sys2.g(x.slice(sys1.state.length), u, t)
            ]);
        };

        const initialState = new Float64Array([...sys1.state, ...sys2.state]);
        const directFeedthrough = sys1.directFeedthrough || sys2.directFeedthrough;
        const system = new DynamicSystem(id, f, g, directFeedthrough, initialState);
        system.subsystems = [sys1, sys2];
        return system;
    }

    static feedback(sys1: DynamicSystem, sys2: DynamicSystem, feedin: number[] = [], feedout: number[] = [], feedsign: number = -1): DynamicSystem {
        const id = `${sys1.id}_feedback_${sys2.id}`;
        
        if (sys1.directFeedthrough && sys2.directFeedthrough) {
            console.warn('Both systems have direct feedthrough. The feedback connection will not work as expected.');
        }
        const nx1 = sys1.getDimension();
        const f = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            const x1 = x.slice(0, nx1);
            const x2 = x.slice(nx1);

            let u1 = new Float64Array(u);
            let y1 = sys1.g(x1, u, t);
            const u2 = selectInputs(y1, feedin);
            const y2 = sys2.g(x2, u2, t);
            feedout.forEach((i, j) => u1[i] += feedsign * y2[j]);
            return new Float64Array([...sys1.f(x1, u1, t), ...sys2.f(x2, u2, t)]);
        };
        
        const g = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            const x1 = x.slice(0, sys1.getDimension());
            const x2 = x.slice(sys1.getDimension());
            let u1 = new Float64Array(u);
            let y1 = sys1.g(x1, u1, t);
            const y2 = sys2.g(x2, selectInputs(y1, feedin), t);           
            feedout.forEach((i, j) => u1[i] = feedsign * y2[j]);
                    
            return sys1.g(x1, u1, t);
        };
        
        const initialState = new Float64Array([...sys1.getState(), ...sys2.getState()]);
        const directFeedthrough = sys1.directFeedthrough;
        return new DynamicSystem(id, f, g, directFeedthrough, initialState);
    }

    static linearSystem(A: number[][], B: number[][], C: number[][], D: number[][], initialState: number[]): DynamicSystem {
        const id = 'linear_system';
        
        const convertTo64BitArray = (arr: number[][]): Float64Array[] => {
            return arr.map(row => new Float64Array(row));
        };

        const A64 = convertTo64BitArray(A);
        const B64 = convertTo64BitArray(B);
        const C64 = convertTo64BitArray(C);
        const D64 = convertTo64BitArray(D);

        const f = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            return vectorAdd(matrixMultiply(A64, x), matrixMultiply(B64, u));
        };

        const g = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            return vectorAdd(matrixMultiply(C64, x), matrixMultiply(D64, u));
        };

        const directFeedthrough = D.some(row => row.some(v => v !== 0));
        return new DynamicSystem(id, f, g, directFeedthrough, new Float64Array(initialState));
    }


    static staticGain(k: number): DynamicSystem {
        const id = `static_gain_${k}`;
        const f = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            return new Float64Array();
        };

        const g = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            return vectorScale(u, k);
        };

        return new DynamicSystem(id, f, g, false, new Float64Array());
    }

    static constant(value: Float64Array): DynamicSystem {
        const id = `constant_${value}`;
        const f = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            return new Float64Array();
        };

        const g = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            return value;
        };

        return new DynamicSystem(id, f, g, false, new Float64Array());
    }
}

export { vectorAdd, vectorScale, matrixMultiply, selectInputs };