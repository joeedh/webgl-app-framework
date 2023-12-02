import {
    Graph, INodeDef, Node,
    NodeSocketType
} from './graph.js';
import {
    FloatSocket, BoolSocket, IntSocket,
    Vec3Socket
} from './graphsockets.js';
import {
    util, math,
    Vector2, Vector3, Vector4, Matrix4, Quat,
    nstructjs
} from '../path.ux/scripts/pathux';

export class TestContext {
    prop1 = 0;
}

export class TestNode<InputSet = {}, OutputSet = {}> extends Node<
    InputSet & {
    depend: IntSocket,
    f: FloatSocket
},
    OutputSet & {
    depend: IntSocket,
    f: FloatSocket,
},
    TestContext
> {
    exec(ctx: TestContext) {
        let a = this.inputs.f.getValue();
    }

    static nodedef(): INodeDef {
        return {
            name: "test",
            uiname: "test",
            inputs: {
                depend: new IntSocket(),
                f: new IntSocket()
            },
            outputs: {
                depend: new IntSocket(),
                f: new IntSocket()
            }
        }
    }
}

export class DerivedNode extends TestNode<
    {
        i: IntSocket
    },
    {
        b: IntSocket
    }
> {
    exec(ctx: TestContext) {
        this.inputs.f.setValue(this.inputs.i.getValue())
    }

    static nodedef(): INodeDef {
        return {
            name: "derived",
            uiname: "derived",
            inputs: Node.inherit({
                i: new IntSocket()
            }),
            outputs: Node.inherit({
                b: new IntSocket()
            })
        }
    }
}
