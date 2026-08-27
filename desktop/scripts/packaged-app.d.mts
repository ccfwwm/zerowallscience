export interface PackagedApp {
  root: string
  resourcesRoot: string
  executablePath: string
}

export function locatePackagedApp(packageRoot: string): Promise<PackagedApp>
