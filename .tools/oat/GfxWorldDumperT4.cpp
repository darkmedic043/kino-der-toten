#include "GfxWorldDumperT4.h"

#include "Game/T4/CommonT4.h"

#include <cstdio>
#include <string>
#include <vector>

using namespace T4;

namespace gfx_world
{
    namespace
    {
        std::string Escape(const char* text)
        {
            std::string out;
            for (const char* c = text ? text : ""; *c; c++)
            {
                if (*c == '"' || *c == '\\')
                    out.push_back('\\');
                out.push_back(*c);
            }
            return out;
        }

        void DumpObj(std::ostream& out, const GfxWorld& world)
        {
            const auto* surfaces = world.dpvs.surfaces;
            const auto* vertices = world.vd.vertices;
            const auto* indices = world.indices;
            char line[256];
            unsigned base = 1; // OBJ indices are 1-based and global
            out << "# World at War map geometry (CoD units). One group per material; surface index in the object name.\n";

            for (auto s = 0; s < world.surfaceCount; s++)
            {
                const auto& surface = surfaces[s];
                const auto& tris = surface.tris;
                if (!surface.material || tris.vertexCount == 0 || tris.triCount == 0)
                    continue;

                std::snprintf(line, sizeof(line), "o surf_%d\ng %s\nusemtl %s\n", s, surface.material->info.name, surface.material->info.name);
                out << line;

                // Surfaces of one batch share a vertex pool (vertexCount is the pool's size), so only the vertices
                // this surface's triangles use are written.
                std::vector<int> remap(tris.vertexCount, -1);
                std::vector<unsigned> used;
                std::vector<unsigned> faces;
                for (unsigned t = 0; t < tris.triCount; t++)
                {
                    const unsigned i0 = indices[tris.baseIndex + t * 3 + 0], i1 = indices[tris.baseIndex + t * 3 + 1], i2 = indices[tris.baseIndex + t * 3 + 2];
                    if (i0 >= tris.vertexCount || i1 >= tris.vertexCount || i2 >= tris.vertexCount)
                        continue;
                    for (const unsigned i : {i0, i1, i2})
                    {
                        if (remap[i] < 0)
                        {
                            remap[i] = static_cast<int>(used.size());
                            used.push_back(i);
                        }
                        faces.push_back(base + static_cast<unsigned>(remap[i]));
                    }
                }
                for (const unsigned i : used)
                {
                    const auto& vertex = vertices[tris.firstVertex + i];
                    std::snprintf(line, sizeof(line), "v %.4f %.4f %.4f\n", vertex.xyz[0], vertex.xyz[1], vertex.xyz[2]);
                    out << line;
                }
                for (const unsigned i : used)
                {
                    const auto& vertex = vertices[tris.firstVertex + i];
                    std::snprintf(line, sizeof(line), "vt %.5f %.5f\n", vertex.texCoord[0], 1.0f - vertex.texCoord[1]);
                    out << line;
                }
                for (const unsigned i : used)
                {
                    float normal[3];
                    Common::Vec3UnpackUnitVec(vertices[tris.firstVertex + i].normal, normal);
                    std::snprintf(line, sizeof(line), "vn %.4f %.4f %.4f\n", normal[0], normal[1], normal[2]);
                    out << line;
                }
                for (size_t f = 0; f + 2 < faces.size(); f += 3)
                {
                    std::snprintf(line, sizeof(line), "f %u/%u/%u %u/%u/%u %u/%u/%u\n", faces[f], faces[f], faces[f], faces[f + 1], faces[f + 1], faces[f + 1], faces[f + 2], faces[f + 2], faces[f + 2]);
                    out << line;
                }
                base += static_cast<unsigned>(used.size());
            }
        }

        void DumpStaticModels(std::ostream& out, const GfxWorld& world)
        {
            const auto* instances = world.dpvs.smodelDrawInsts;
            char line[512];
            out << "{\"models\":[\n";
            for (unsigned i = 0; i < world.dpvs.smodelCount; i++)
            {
                const auto& inst = instances[i];
                const auto& p = inst.placement;
                std::snprintf(line,
                              sizeof(line),
                              "%s{\"model\":\"%s\",\"origin\":[%.4f,%.4f,%.4f],\"axis\":[[%.6f,%.6f,%.6f],[%.6f,%.6f,%.6f],[%.6f,%.6f,%.6f]],\"scale\":%.5f}",
                              i ? ",\n" : "",
                              Escape(inst.model ? inst.model->name : "").c_str(),
                              p.origin[0], p.origin[1], p.origin[2],
                              p.axis[0][0], p.axis[0][1], p.axis[0][2],
                              p.axis[1][0], p.axis[1][1], p.axis[1][2],
                              p.axis[2][0], p.axis[2][1], p.axis[2][2],
                              p.scale);
                out << line;
            }
            out << "\n]}\n";
        }

        void DumpBrushModels(std::ostream& out, const GfxWorld& world)
        {
            char line[256];
            out << "{\"brushModels\":[\n";
            for (auto i = 0; i < world.modelCount; i++)
            {
                const auto& model = world.models[i];
                std::snprintf(line,
                              sizeof(line),
                              "%s{\"index\":%d,\"startSurface\":%u,\"surfaceCount\":%u,\"mins\":[%.3f,%.3f,%.3f],\"maxs\":[%.3f,%.3f,%.3f]}",
                              i ? ",\n" : "",
                              i,
                              model.startSurfIndex, model.surfaceCount,
                              model.bounds[0][0], model.bounds[0][1], model.bounds[0][2],
                              model.bounds[1][0], model.bounds[1][1], model.bounds[1][2]);
                out << line;
            }
            out << "\n]}\n";
        }
    } // namespace

    void DumperT4::DumpAsset(AssetDumpingContext& context, const XAssetInfo<GfxWorld>& asset)
    {
        const auto* world = asset.Asset();

        if (const auto file = context.OpenAssetFile(asset.m_name + ".obj"))
            DumpObj(*file, *world);
        if (const auto file = context.OpenAssetFile(asset.m_name + ".smodels.json"))
            DumpStaticModels(*file, *world);
        if (const auto file = context.OpenAssetFile(asset.m_name + ".brushmodels.json"))
            DumpBrushModels(*file, *world);
    }
} // namespace gfx_world
