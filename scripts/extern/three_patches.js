//patch a serialization bug
import cconst from '../core/const.js';

//suppress stupid THREE.js matrix inversion warning
THREE.Matrix4.prototype.getInverse = function ( m, throwOnDegenerate ) {

  // based on http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm
  var te = this.elements,
    me = m.elements,

    n11 = me[ 0 ], n21 = me[ 1 ], n31 = me[ 2 ], n41 = me[ 3 ],
    n12 = me[ 4 ], n22 = me[ 5 ], n32 = me[ 6 ], n42 = me[ 7 ],
    n13 = me[ 8 ], n23 = me[ 9 ], n33 = me[ 10 ], n43 = me[ 11 ],
    n14 = me[ 12 ], n24 = me[ 13 ], n34 = me[ 14 ], n44 = me[ 15 ],

    t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44,
    t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44,
    t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44,
    t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;

  var det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;

  if ( det === 0 ) {

    var msg = "THREE.Matrix4: .getInverse() can't invert matrix, determinant is 0";

    if ( throwOnDegenerate === true ) {

      throw new Error( msg );

    } else {
      if (cconst.DEBUG.THREE) {
        console.warn(msg);
      }

    }

    return this.identity();

  }

  var detInv = 1 / det;

  te[ 0 ] = t11 * detInv;
  te[ 1 ] = ( n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44 ) * detInv;
  te[ 2 ] = ( n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44 ) * detInv;
  te[ 3 ] = ( n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43 ) * detInv;

  te[ 4 ] = t12 * detInv;
  te[ 5 ] = ( n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44 ) * detInv;
  te[ 6 ] = ( n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44 ) * detInv;
  te[ 7 ] = ( n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43 ) * detInv;

  te[ 8 ] = t13 * detInv;
  te[ 9 ] = ( n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44 ) * detInv;
  te[ 10 ] = ( n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44 ) * detInv;
  te[ 11 ] = ( n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43 ) * detInv;

  te[ 12 ] = t14 * detInv;
  te[ 13 ] = ( n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34 ) * detInv;
  te[ 14 ] = ( n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34 ) * detInv;
  te[ 15 ] = ( n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33 ) * detInv;

  return this;

};

THREE.ShaderMaterial.prototype.toJSON = function ( meta ) {
  var data = THREE.Material.prototype.toJSON.call( this, meta );

  data.uniforms = {};

  for ( var name in this.uniforms ) {

    var uniform = this.uniforms[ name ];
    var value = uniform.value;

    if ( value && value.isTexture ) {
      let convert = value.image !== undefined;
      convert = convert && !(value.image instanceof HTMLCanvasElement);
      convert = convert && value.image.data;
      convert = convert && !(value.image.data instanceof HTMLCanvasElement);

      if (convert) {
        let ud = new ImageData(value.image.width, value.image.height);
        ud.uuid = value.image.uuid;

        let idata = value.image.data;

        let pixels = value.image.width*value.image.height;
        let bpp = idata.length / pixels;

        for (let i=0; i<pixels; i++) {
          for (let j=0; j<bpp; j++) {
            ud.data[i*4+j] = idata[i*bpp+j];
          }
        }

        let old = value.image;
        value.image = ud;

        data.uniforms[name] = {
          type: 't',
          value: value.toJSON(meta).uuid
        };

        value.image = old;
      } else {

        data.uniforms[name] = {
          type: 't',
          value: value.toJSON(meta).uuid
        };
      }
    } else if ( value && value.isColor ) {

      data.uniforms[ name ] = {
        type: 'c',
        value: value.getHex()
      };

    } else if ( value && value.isVector2 ) {

      data.uniforms[ name ] = {
        type: 'v2',
        value: value.toArray()
      };

    } else if ( value && value.isVector3 ) {

      data.uniforms[ name ] = {
        type: 'v3',
        value: value.toArray()
      };

    } else if ( value && value.isVector4 ) {

      data.uniforms[ name ] = {
        type: 'v4',
        value: value.toArray()
      };

    } else if ( value && value.isMatrix3 ) {

      data.uniforms[ name ] = {
        type: 'm3',
        value: value.toArray()
      };

    } else if ( value && value.isMatrix4 ) {

      data.uniforms[ name ] = {
        type: 'm4',
        value: value.toArray()
      };

    } else {

      data.uniforms[ name ] = {
        value: value
      };

      // note: the array variants v2v, v3v, v4v, m4v and tv are not supported so far

    }

  }

  if ( Object.keys( this.defines ).length > 0 ) { data.defines = this.defines; }

  data.vertexShader = this.vertexShader;
  data.fragmentShader = this.fragmentShader;

  var extensions = {};

  for ( var key in this.extensions ) {

    if ( this.extensions[ key ] === true ) { extensions[ key ] = true; }

  }

  if ( Object.keys( extensions ).length > 0 ) { data.extensions = extensions; }

  return data;

};