export interface BrainTransformRequest {
  sessionId:string
  action:'inspect'|'map'
  registrationArtifactId:string
  coordinates?:Array<[number,number,number]>
  coordinateSpace?:'brainreg-downsampled-asr-voxel'
}
export interface BrainTransformContract {
  format:'zerowall-brainreg-transform'
  version:1
  producer:{brainreg:string;atlasapi:string}
  atlas:'allen_mouse_25um'
  atlasVersion:string
  atlasOrientation:'asr'
  sourceSpace:'brainreg-downsampled-asr-voxel'
  fieldUnits:'atlas-absolute-millimeter'
  direction:'sample-grid-to-atlas'
  interpolation:'trilinear'
  sourceShape:[number,number,number]
  atlasShape:[number,number,number]
  atlasResolution:[number,number,number]
  files:Array<{name:string;sha256:string;bytes:number}>
}
