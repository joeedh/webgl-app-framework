create a plan to switch from webgl to webgpu.  take the oppurtunity to cleanup simplemesh (propose cleanups, e.g. fix the API
  incompatibility between chunkedsimplemesh and simplemesh).  you will have to transpile the existing shaders, including the ones in
  sculptcore\source\spatial\shaders\spatial_shaders.cc.  propose various options to deal with preprocessor macros (add a preprocessor  
  in front of wgsl? use builtin constants? etc).  plan to migrate everything except pbvh_texpaint.ts and pbvh_texpaint_blur.ts, that
  will be deferred for now.  propose various options for refactoring the code to properly build pipelines (this will likely involve
  replacing the immediate mode draw functions in SceneObjectData with ones that build up a draw pipeline or batch or whatever).  
