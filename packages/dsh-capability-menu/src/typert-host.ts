import remote from './client/remote.ts'

/** Host and browser use the same codecs; dispatch targets the gateway service. */
export const TYPERT = {
  package: remote.package,
  face: 'host',
  schemas: [],
  invocations: remote.descriptors.map(descriptor => ({ ...descriptor, service: 'capabilityPolicyGateway' })),
  model: { services: [], events: [], objects: [] },
}
