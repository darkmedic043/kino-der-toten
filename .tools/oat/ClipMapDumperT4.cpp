#include "ClipMapDumperT4.h"

#include <cstdio>
#include <map>
#include <set>
#include <string>
#include <vector>

using namespace T4;

namespace clip_map
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

        // the brushes under a leaf-brush node: a leaf lists them, an inner node has two children at relative offsets
        void CollectBrushes(const clipMap_t& cm, const unsigned node, std::set<unsigned>& out, const int depth)
        {
            if (node >= cm.leafbrushNodesCount || depth > 64)
                return;
            const auto& n = cm.leafbrushNodes[node];
            if (n.leafBrushCount > 0)   // a leaf (OAT's zone code: data::leaf when leafBrushCount > 0)
            {
                if (n.data.leaf.brushes)
                    for (auto k = 0; k < n.leafBrushCount; k++)
                        out.insert(n.data.leaf.brushes[k]);
                return;
            }
            for (const auto offset : n.data.children.childOffset)
                if (offset)
                    CollectBrushes(cm, node + offset, out, depth + 1);
        }

        // the partitions (terrain/patch triangles) under an AABB tree node, with the node's material
        void CollectPartitions(const clipMap_t& cm, const int index, std::map<int, int>& out, const int depth)
        {
            if (index < 0 || index >= cm.aabbTreeCount || depth > 64)
                return;
            const auto& t = cm.aabbTrees[index];
            if (t.childCount == 0)
            {
                out[t.u.partitionIndex] = t.materialIndex;
                return;
            }
            for (auto c = 0; c < t.childCount; c++)
                CollectPartitions(cm, t.u.firstChildIndex + c, out, depth + 1);
        }

        void DumpClipMap(std::ostream& out, const clipMap_t& cm)
        {
            char line[512];
            out << "{\"materials\":[";
            for (auto i = 0u; i < cm.numMaterials; i++)
            {
                const auto& m = cm.materials[i];
                std::snprintf(line, sizeof(line), "%s{\"name\":\"%s\",\"surfaceFlags\":%d,\"contents\":%d}", i ? "," : "", Escape(m.material).c_str(), m.surfaceFlags, m.contentFlags);
                out << line;
            }

            // which submodel each brush and partition belongs to (cmodel 0 is the world)
            std::vector<int> brushModel(cm.numBrushes, 0);
            std::map<int, int> partitionModel;
            for (auto i = 1u; i < cm.numSubModels; i++)
            {
                const auto& leaf = cm.cmodels[i].leaf;
                std::set<unsigned> brushes;
                if (leaf.brushContents)
                    CollectBrushes(cm, static_cast<unsigned>(leaf.leafBrushNode), brushes, 0);
                for (const auto b : brushes)
                    if (b < cm.numBrushes)
                        brushModel[b] = static_cast<int>(i);
                std::map<int, int> parts;
                for (auto a = 0; a < leaf.collAabbCount; a++)
                    CollectPartitions(cm, leaf.firstCollAabbIndex + a, parts, 0);
                for (const auto& [p, mat] : parts)
                    partitionModel[p] = static_cast<int>(i);
            }

            out << "],\n\"brushes\":[\n";
            for (auto i = 0u; i < cm.numBrushes; i++)
            {
                const auto& b = cm.brushes[i];
                std::snprintf(line, sizeof(line), "%s{\"model\":%d,\"contents\":%d,\"mins\":[%.3f,%.3f,%.3f],\"maxs\":[%.3f,%.3f,%.3f],\"axialMaterial\":[[%d,%d,%d],[%d,%d,%d]],\"sides\":[",
                              i ? ",\n" : "", brushModel[i], b.contents, b.mins[0], b.mins[1], b.mins[2], b.maxs[0], b.maxs[1], b.maxs[2],
                              b.axialMaterialNum[0][0], b.axialMaterialNum[0][1], b.axialMaterialNum[0][2], b.axialMaterialNum[1][0], b.axialMaterialNum[1][1], b.axialMaterialNum[1][2]);
                out << line;
                for (auto s = 0u; s < b.numsides; s++)
                {
                    const auto& side = b.sides[s];
                    if (!side.plane)
                        continue;
                    std::snprintf(line, sizeof(line), "%s[%.6f,%.6f,%.6f,%.4f,%u]", s ? "," : "", side.plane->normal[0], side.plane->normal[1], side.plane->normal[2], side.plane->dist, side.materialNum);
                    out << line;
                }
                out << "]}";
            }

            out << "\n],\n\"verts\":[";
            for (auto i = 0u; i < cm.vertCount; i++)
            {
                std::snprintf(line, sizeof(line), "%s%.3f,%.3f,%.3f", i ? "," : "", cm.verts[i].x, cm.verts[i].y, cm.verts[i].z);
                out << line;
            }
            // terrain/patch triangles by partition: [model, material, i0, i1, i2, ...]
            std::map<int, int> partMaterial;
            for (auto t = 0; t < cm.aabbTreeCount; t++)
                if (cm.aabbTrees[t].childCount == 0)
                    partMaterial[cm.aabbTrees[t].u.partitionIndex] = cm.aabbTrees[t].materialIndex;
            out << "],\n\"partitions\":[\n";
            for (auto p = 0; p < cm.partitionCount; p++)
            {
                const auto& part = cm.partitions[p];
                const auto model = partitionModel.count(p) ? partitionModel[p] : 0;
                const auto mat = partMaterial.count(p) ? partMaterial[p] : -1;
                std::snprintf(line, sizeof(line), "%s[%d,%d", p ? ",\n" : "", model, mat);
                out << line;
                for (auto t = 0; t < part.triCount; t++)
                {
                    const auto* tri = &cm.triIndices[3 * (part.firstTri + t)];
                    std::snprintf(line, sizeof(line), ",%u,%u,%u", tri[0], tri[1], tri[2]);
                    out << line;
                }
                out << "]";
            }

            // static models and the collision surfaces of their xmodels
            out << "\n],\n\"staticModels\":[\n";
            std::map<std::string, const XModel*> models;
            for (auto i = 0u; i < cm.numStaticModels; i++)
            {
                const auto& s = cm.staticModelList[i];
                const auto* m = s.xmodel;
                const auto* name = m && m->name ? m->name : "";
                if (m)
                    models[name] = m;
                const auto& a = s.invScaledAxis;
                std::snprintf(line, sizeof(line), "%s{\"model\":\"%s\",\"origin\":[%.4f,%.4f,%.4f],\"invScaledAxis\":[[%.7f,%.7f,%.7f],[%.7f,%.7f,%.7f],[%.7f,%.7f,%.7f]]}",
                              i ? ",\n" : "", Escape(name).c_str(), s.origin[0], s.origin[1], s.origin[2],
                              a[0][0], a[0][1], a[0][2], a[1][0], a[1][1], a[1][2], a[2][0], a[2][1], a[2][2]);
                out << line;
            }
            out << "\n],\n\"xmodels\":{\n";
            auto first = true;
            for (const auto& [name, m] : models)
            {
                std::snprintf(line, sizeof(line), "%s\"%s\":{\"contents\":%d,\"collSurfs\":[", first ? "" : ",\n", Escape(name.c_str()).c_str(), m->contents);
                out << line;
                first = false;
                for (auto c = 0; c < m->numCollSurfs; c++)
                {
                    const auto& surf = m->collSurfs[c];
                    std::snprintf(line, sizeof(line), "%s{\"contents\":%d,\"surfFlags\":%d,\"bone\":%d,\"tris\":[", c ? "," : "", surf.contents, surf.surfFlags, surf.boneIdx);
                    out << line;
                    for (auto t = 0; t < surf.numCollTris; t++)
                    {
                        const auto& tri = surf.collTris[t];
                        std::snprintf(line, sizeof(line), "%s[%.6f,%.6f,%.6f,%.4f,%.6f,%.6f,%.6f,%.4f,%.6f,%.6f,%.6f,%.4f]", t ? "," : "",
                                      tri.plane[0], tri.plane[1], tri.plane[2], tri.plane[3], tri.svec[0], tri.svec[1], tri.svec[2], tri.svec[3],
                                      tri.tvec[0], tri.tvec[1], tri.tvec[2], tri.tvec[3]);
                        out << line;
                    }
                    out << "]}";
                }
                out << "]}";
            }
            out << "\n}}\n";
        }
    } // namespace

    void DumperT4::DumpAsset(AssetDumpingContext& context, const XAssetInfo<clipMap_t>& asset)
    {
        if (const auto file = context.OpenAssetFile(asset.m_name + ".clipmap.json"))
            DumpClipMap(*file, *asset.Asset());
    }

    void PvsDumperT4::DumpAsset(AssetDumpingContext& context, const XAssetInfo<clipMap_t>& asset)
    {
        if (const auto file = context.OpenAssetFile(asset.m_name + ".clipmap.json"))
            DumpClipMap(*file, *asset.Asset());
    }
} // namespace clip_map
