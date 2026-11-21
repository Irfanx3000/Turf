import { Global, Module } from "@nestjs/common";
import { createMapsProvider } from "./maps-provider.js";

export const MAPS_PROVIDER = Symbol("MAPS_PROVIDER");

@Global()
@Module({
  providers: [{ provide: MAPS_PROVIDER, useFactory: () => createMapsProvider() }],
  exports: [MAPS_PROVIDER],
})
export class MapsModule {}
