#pragma once

#include "Dumping/AbstractAssetDumper.h"
#include "Game/T4/T4.h"

namespace gfx_world
{
    // Dumps a T4 (World at War) map's render geometry: <name>.obj (one group per material, CoD units),
    // <name>.smodels.json (placed static models) and <name>.brushmodels.json (door/barrier brush models).
    class DumperT4 final : public AbstractAssetDumper<T4::AssetGfxWorld>
    {
    protected:
        void DumpAsset(AssetDumpingContext& context, const XAssetInfo<T4::GfxWorld>& asset) override;
    };
} // namespace gfx_world
