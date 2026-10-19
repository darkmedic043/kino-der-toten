#pragma once

#include "Dumping/AbstractAssetDumper.h"
#include "Game/T4/T4.h"

namespace clip_map
{
    // Dumps a T4 (World at War) map's collision (the clipMap): <name>.clipmap.json with the brushes (their AABB plus
    // non-axial side planes, contents flags, and the submodel each belongs to: 0 = the world, otherwise a brush model
    // such as a door), the terrain/patch triangles with their material, the materials' surface/content flags, the
    // collidable static models and their xmodels' collision surfaces.
    class DumperT4 final : public AbstractAssetDumper<T4::AssetClipMap>
    {
    protected:
        void DumpAsset(AssetDumpingContext& context, const XAssetInfo<T4::clipMap_t>& asset) override;
    };

    class PvsDumperT4 final : public AbstractAssetDumper<T4::AssetClipMapPvs>
    {
    protected:
        void DumpAsset(AssetDumpingContext& context, const XAssetInfo<T4::clipMap_t>& asset) override;
    };
} // namespace clip_map
