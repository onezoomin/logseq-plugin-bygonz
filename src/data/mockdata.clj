{:block/uuid #uuid "63619191-9216-4ff6-8fa3-fc34c4af7d1e",
 :block/properties {},
 :block/journal? true,
 :block/left {:db/id 322},
 :block/format :markdown,
 :block/content "Basic Mock Tree for Sync",
 :db/id 323,
 :block/path-refs [{:db/id 19}],
 :block/parent {:db/id 19},
 :block/unordered true, 
 :block/page {:db/id 19}}

{:block/properties-text-values
 {:id "6361919b-0e19-4d1e-aa70-6aadbc4243a1",
  :propnum "1",
  :propfu "bar"},
 :block/uuid #uuid "6361919b-0e19-4d1e-aa70-6aadbc4243a1",
 :block/properties
 {:id "6361919b-0e19-4d1e-aa70-6aadbc4243a1",
  :propnum 1,
  :propfu "bar"},
 :block/journal? true,
 :block/left {:db/id 323},
 :block/refs [{:db/id 334} {:db/id 359} {:db/id 362}],
 :block/properties-order (:id :propnum :propfu),
 :block/format :markdown,
 :block/content
 "Item 1 #tagged \nid:: 6361919b-0e19-4d1e-aa70-6aadbc4243a1\npropnum::  1\npropfu:: bar\nwill be referenced by item 3",
 :db/id 324,
 :block/path-refs [{:db/id 19} {:db/id 334} {:db/id 359} {:db/id 362}],
 :block/parent {:db/id 323},
 :block/unordered true, 
 :block/page {:db/id 19}}

{:block/uuid #uuid "636191b3-a339-4346-9d50-89b4b10550ed",
 :block/properties {},
 :block/journal? true,
 :block/left {:db/id 324},
 :block/format :markdown,
 :block/content "Item 2 is within Item 1",
 :db/id 325,
 :block/path-refs [{:db/id 19} {:db/id 334}],
 :block/parent {:db/id 324},
 :block/unordered true, 
 :block/page {:db/id 19}}


{:block/uuid #uuid "636191c0-e78a-473f-9e7e-c97295df12a0",
 :block/properties {},
 :block/journal? true,
 :block/left {:db/id 324},
 :block/refs [{:db/id 324}],
 :block/format :markdown,
 :block/content
 "Item 3 [see ((6361919b-0e19-4d1e-aa70-6aadbc4243a1))]",
 :db/id 326,
 :block/path-refs [{:db/id 19} {:db/id 324}],
 :block/parent {:db/id 323},
 :block/unordered true, 
 :block/page {:db/id 19}}

;; as json from logseq.Editor.getCurrentBlock()
{
    "unordered": true,
    "parent": {
        "id": 19
    },
    "children": [
        [
            "uuid",
            null
        ],
        [
            "uuid",
            null
        ],
        [
            "uuid",
            null
        ]
    ],
    "id": 539,
    "pathRefs": [
        {
            "id": 19
        }
    ],
    "uuid": "6362c03c-fd5f-49e5-af3e-7459a1f09b33",
    "content": "Basic Mock Tree for Sync",
    "page": {
        "id": 19
    },
    "left": {
        "id": 538
    },
    "format": "markdown"
}