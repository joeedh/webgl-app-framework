import {DataAPI, DataStruct, nstructjs, ToolProperty} from '../path.ux/pathux.js';
import {Vector2, Vector3, Vector4, Matrix4} from '../path.ux/scripts/util/vectormath.js';
import {PropTypes} from '../path.ux/scripts/pathux.js';
import {Container} from '../path.ux/scripts/core/ui.js';
import {StructReader} from '../path.ux/scripts/path-controller/types/util/nstructjs.js';

export const Textures = [];
export const TextureShaders = {};

export const TextureShaderFlags = {
  HAS_COLOR: 1
};

//export type TexUniformType = number | number[] | Matrix4 | Vector2 | Vector3 | Vector4

export type ITextureShaderDef = {
  typeName: string,
  uiName?: string,
  fragmentPre?: string,
  flag?: number,
  uniforms?: { [k: string]: ToolProperty<any> },
  params?: { [k: string]: ToolProperty<any> }
};

export interface ITextureShaderConstructor<T = any> {
  new(): T

  textureDefine(): ITextureShaderDef

  STRUCT: string
}

export class TextureShader {
  ["constructor"]: ITextureShaderConstructor<this>

  static STRUCT = nstructjs.inlineRegister(this, `
  TextureShader {
    typeName : string;
    flag     : int;
    id       : int;
    params   : string | JSON.stringify(this.params);
    uniforms : string | JSON.stringify(this.uniforms);
  }
`)


  typeName: string;
  params: { [k: string]: ToolProperty<any> }
  uniforms: { [k: string]: ToolProperty<any> };
  flag = 0;
  id = -1;


  constructor() {
    let def = this.constructor.textureDefine();
    this.typeName = def.typeName;

    for (let k in def.params) {
      let prop = def.params[k];
      this.params[k] = prop.copy().getValue();
    }

    for (let k in def.uniforms) {
      this.uniforms[k] = def.uniforms[k].copy().getValue();
    }
  }

  copyTo(b: this): this {
    let def = this.constructor.textureDefine();

    b.flag = this.flag;
    b.id = this.id;

    for (let i = 0; i < 2; i++) {
      let list1 = i ? this.uniforms : this.params;
      let list2 = i ? b.uniforms : b.params;
      let slist = i ? def.uniforms : def.params;

      for (let k in list1) {
        let v = list1[k] as unknown as any;

        if (!(k in slist)) {
          if (typeof v === "object" && v instanceof Array) {
            v = v.concat([]);
          } else if (typeof v === "object" && typeof v.copy === "function") {
            v = v.copy();
          } else if (typeof v === "object" && typeof v.clone === "function") {
            v = v.clone();
          }
        } else {
          let prop = slist[k].copy();
          prop.setValue(v);

          v = prop.getValue();
        }

        list2[k] = v;
      }
    }

    return b;
  }

  static textureDefine() {
    return {
      typeName   : "",
      uiName     : "",
      fragmentPre: "",
      flag       : 0, //e.g. TextureShaderFlags.HAS_COLOR
      uniforms   : {
        //ToolProperties, but not for instansiation
      },
      params     : {
        //ToolProperties, but not for instansiation
      }
    } as ITextureShaderDef
  }

  static defineAPI(api: DataAPI): DataStruct {
    let st = api.mapStruct(this);

    st.string("typeName", "type", "Type", "Type Name").readOnly();
    let sdef = this.textureDefine();

    for (let i = 0; i < 2; i++) {
      let key = i ? "uniforms" : "params";
      let list = sdef[key];

      let st2 = st.struct(key, key, key);

      for (let k in list) {
        let prop = list[k];

        st2.fromToolProp(k, prop);
      }
    }

    return st;
  }

  static buildUI(container: Container) {
    let def = this.textureDefine();

    for (let i = 0; i < 2; i++) {
      let key = i ? "uniforms" : "params";
      let list = this[key];
      let slist = def[key];

      let path = key + ".";

      for (let k of list) {
        let prop = slist[k];

        let apiname = k;

        if (prop && prop.apiname && prop.apiname.length > 0) {
          apiname = prop.apiname;
        }

        container.prop(path + apiname);
      }
    }
  }

  genCode(): string {
    return `

float fsample(vec3 co, vec3 colorOut) {
}    

    `;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);

    this.params = JSON.parse(this.params as unknown as string);
    this.uniforms = JSON.parse(this.uniforms as unknown as string);

    for (let i = 0; i < 2; i++) {
      let list = (i ? this.uniforms : this.params) as unknown as any;

      for (let k in list) {
        let v = list[k];

        if (!(v instanceof Array)) {
          continue;
        }

        switch (v.length) {
          case 2:
            v = new Vector2(v);
            break;
          case 3:
            v = new Vector3(v);
            break;
          case 4:
            v = new Vector4(v);
            break;
          case 16:
            v = new Matrix4(v);
        }

        list[k] = v;
      }
    }
  }

  static register(cls: ITextureShaderConstructor) {
    let def = cls.textureDefine();

    if (cls.textureDefine === TextureShader.textureDefine) {
      throw new Error("missing textureDefine");
    }

    if (cls.STRUCT === TextureShader.STRUCT || !cls.STRUCT) {
      console.warn("Auto-registering texture shader with nstructjs. . .");

      cls.STRUCT = nstructjs.inherit(cls.STRUCT, TextureShader) + `\n}`;
      nstructjs.register(cls);
    } else if (!(cls as unknown as any).structName) {
      throw new Error("You wrote a STRUCT script but forgot to register it with nstructjs");
    }

    TextureShaders[def.typeName] = cls;
    Textures.push(cls);
  }

  static getTextureClass(name: string): ITextureShaderConstructor {
    for (let cls of Textures) {
      if (cls.textureDefine().typeName === name) {
        return cls;
      }
    }
  }
}
