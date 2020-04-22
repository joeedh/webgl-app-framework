import './potree/build/potree/potree.js';

/**
 *
 *
 *
 * params.pickWindowSize:	Look for points inside a pixel window of this size.
 *							Use odd values: 1, 3, 5, ...
 *
 *
 * TODO: only draw pixels that are actually read with readPixels().
 *
 */
Potree.PointCloudOctree.prototype.pick = function pick(viewer, camera, ray, params = {}) {

  let renderer = viewer.renderer;
  let pRenderer = viewer.pRenderer;

  performance.mark("pick-start");

  let getVal = (a, b) => a !== undefined ? a : b;

  let pickWindowSize = getVal(params.pickWindowSize, 17);
  let pickOutsideClipRegion = getVal(params.pickOutsideClipRegion, false);

  pickWindowSize = 65;

  let size = renderer.getSize(new THREE.Vector2());

  let width = Math.ceil(getVal(params.width, size.width));
  let height = Math.ceil(getVal(params.height, size.height));

  let pointSizeType = getVal(params.pointSizeType, this.material.pointSizeType);
  let pointSize = getVal(params.pointSize, this.material.size);

  let nodes = this.nodesOnRay(this.visibleNodes, ray);

  if (nodes.length === 0) {
    return null;
  }

  if (!this.pickState) {
    let scene = new THREE.Scene();

    let material = new Potree.PointCloudMaterial();
    material.activeAttributeName = "indices";

    let renderTarget = new THREE.WebGLRenderTarget(
      1, 1,
      { minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat }
    );

    this.pickState = {
      renderTarget: renderTarget,
      material: material,
      scene: scene
    };
  };

  let pickState = this.pickState;
  let pickMaterial = pickState.material;

  { // update pick material
    pickMaterial.pointSizeType = pointSizeType;
    pickMaterial.shape = this.material.shape;
    pickMaterial.shape = Potree.PointShape.CIRCLE;
    //pickMaterial.shape = Potree.PointShape.PARABOLOID;

    pickMaterial.uniforms.uFilterReturnNumberRange.value = this.material.uniforms.uFilterReturnNumberRange.value;
    pickMaterial.uniforms.uFilterNumberOfReturnsRange.value = this.material.uniforms.uFilterNumberOfReturnsRange.value;
    pickMaterial.uniforms.uFilterGPSTimeClipRange.value = this.material.uniforms.uFilterGPSTimeClipRange.value;
    pickMaterial.uniforms.uFilterPointSourceIDClipRange.value = this.material.uniforms.uFilterPointSourceIDClipRange.value;

    pickMaterial.activeAttributeName = "indices";

    pickMaterial.size = pointSize;
    pickMaterial.uniforms.minSize.value = this.material.uniforms.minSize.value;
    pickMaterial.uniforms.maxSize.value = this.material.uniforms.maxSize.value;
    pickMaterial.classification = this.material.classification;
    pickMaterial.recomputeClassification();

    if(params.pickClipped){
      pickMaterial.clipBoxes = this.material.clipBoxes;
      pickMaterial.uniforms.clipBoxes = this.material.uniforms.clipBoxes;
      if(this.material.clipTask === Potree.ClipTask.HIGHLIGHT){
        pickMaterial.clipTask = Potree.ClipTask.NONE;
      }else{
        pickMaterial.clipTask = this.material.clipTask;
      }
      pickMaterial.clipMethod = this.material.clipMethod;
    }else{
      pickMaterial.clipBoxes = [];
    }

    this.updateMaterial(pickMaterial, nodes, camera, renderer);
  }

  pickState.renderTarget.setSize(width, height);

  let pixelPos = new THREE.Vector2(params.x, params.y);

  let gl = renderer.getContext();
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(
    parseInt(pixelPos.x - (pickWindowSize - 1) / 2),
    parseInt(pixelPos.y - (pickWindowSize - 1) / 2),
    parseInt(pickWindowSize), parseInt(pickWindowSize));


  renderer.state.buffers.depth.setTest(pickMaterial.depthTest);
  renderer.state.buffers.depth.setMask(pickMaterial.depthWrite);
  renderer.state.setBlending(THREE.NoBlending);

  { // RENDER
    renderer.setRenderTarget(pickState.renderTarget);
    gl.clearColor(0, 0, 0, 0);
    renderer.clear(true, true, true);

    let tmp = this.material;
    this.material = pickMaterial;

    pRenderer.renderOctree(this, nodes, camera, pickState.renderTarget);

    this.material = tmp;
  }

  let clamp = (number, min, max) => Math.min(Math.max(min, number), max);

  let x = parseInt(clamp(pixelPos.x - (pickWindowSize - 1) / 2, 0, width));
  let y = parseInt(clamp(pixelPos.y - (pickWindowSize - 1) / 2, 0, height));
  let w = parseInt(Math.min(x + pickWindowSize, width) - x);
  let h = parseInt(Math.min(y + pickWindowSize, height) - y);

  let pixelCount = w * h;
  let buffer = new Uint8Array(4 * pixelCount);

  gl.readPixels(x, y, pickWindowSize, pickWindowSize, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

  renderer.setRenderTarget(null);
  renderer.state.reset();
  renderer.setScissorTest(false);
  gl.disable(gl.SCISSOR_TEST);

  let pixels = buffer;
  let ibuffer = new Uint32Array(buffer.buffer);

  // find closest hit inside pixelWindow boundaries
  let min = Number.MAX_VALUE;
  let hits = [];
  for (let u = 0; u < pickWindowSize; u++) {
    for (let v = 0; v < pickWindowSize; v++) {
      let offset = (u + v * pickWindowSize);
      let distance = Math.pow(u - (pickWindowSize - 1) / 2, 2) + Math.pow(v - (pickWindowSize - 1) / 2, 2);

      let pcIndex = pixels[4 * offset + 3];
      pixels[4 * offset + 3] = 0;
      let pIndex = ibuffer[offset];

      if(!(pcIndex === 0 && pIndex === 0) && (pcIndex !== undefined) && (pIndex !== undefined)){
        let hit = {
          pIndex: pIndex,
          pcIndex: pcIndex,
          distanceToCenter: distance
        };

        if(params.all){
          hits.push(hit);
        }else{
          if(hits.length > 0){
            if(distance < hits[0].distanceToCenter){
              hits[0] = hit;
            }
          }else{
            hits.push(hit);
          }
        }


      }
    }
  }

  //DEBUG: show panel with pick image
  // {
  // 	let img = Utils.pixelsArrayToImage(buffer, w, h);
  // 	let screenshot = img.src;

  // 	if(!this.debugDIV){
  // 		this.debugDIV = $(`
  // 			<div id="pickDebug"
  // 			style="position: absolute;
  // 			right: 400px; width: 300px;
  // 			bottom: 44px; width: 300px;
  // 			z-index: 1000;
  // 			"></div>`);
  // 		$(document.body).append(this.debugDIV);
  // 	}

  // 	this.debugDIV.empty();
  // 	this.debugDIV.append($(`<img src="${screenshot}"
  // 		style="transform: scaleY(-1); width: 300px"/>`));
  // 	//$(this.debugWindow.document).append($(`<img src="${screenshot}"/>`));
  // 	//this.debugWindow.document.write('<img src="'+screenshot+'"/>');
  // }


  for(let hit of hits){
    let point = {};

    if (!nodes[hit.pcIndex]) {
      return null;
    }

    let node = nodes[hit.pcIndex];
    let pc = node.sceneNode;
    let geometry = node.geometryNode.geometry;

    for(let attributeName in geometry.attributes){
      let attribute = geometry.attributes[attributeName];

      if (attributeName === 'position') {
        let x = attribute.array[3 * hit.pIndex + 0];
        let y = attribute.array[3 * hit.pIndex + 1];
        let z = attribute.array[3 * hit.pIndex + 2];

        let position = new THREE.Vector3(x, y, z);
        position.applyMatrix4(pc.matrixWorld);

        point[attributeName] = position;
      } else if (attributeName === 'indices') {

      } else {

        let values = attribute.array.slice(attribute.itemSize * hit.pIndex, attribute.itemSize * (hit.pIndex + 1)) ;

        if(attribute.potree){
          const {scale, offset} = attribute.potree;
          values = values.map(v => v / scale + offset);
        }

        point[attributeName] = values;

        //debugger;
        //if (values.itemSize === 1) {
        //	point[attribute.name] = values.array[hit.pIndex];
        //} else {
        //	let value = [];
        //	for (let j = 0; j < values.itemSize; j++) {
        //		value.push(values.array[values.itemSize * hit.pIndex + j]);
        //	}
        //	point[attribute.name] = value;
        //}
      }

    }

    hit.point = point;
  }

  performance.mark("pick-end");
  performance.measure("pick", "pick-start", "pick-end");

  if(params.all){
    return hits.map(hit => hit.point);
  }else{
    if(hits.length === 0){
      return null;
    }else{
      return hits[0].point;
      //let sorted = hits.sort( (a, b) => a.distanceToCenter - b.distanceToCenter);

      //return sorted[0].point;
    }
  }

};
