//patch a serialization bug

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