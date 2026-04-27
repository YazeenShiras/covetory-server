require("dotenv").config();
const connectDB = require("../config/db");
const User = require("../models/User");
const Product = require("../models/Product");

// Shared Unsplash photos grouped by intent so multiple products
// can share the same image pool without repeating URLs in every entry.
const img = (url) => ({
  url: url.startsWith("http")
    ? url
    : `https://images.unsplash.com/${url}?w=1200&auto=format`,
});

// ------------------------------------------------------------------
//  Products
// ------------------------------------------------------------------
const sampleProducts = [
  // 1 — Overshirt with 3 colors + 5 sizes + full variant stock matrix
  {
    name: "Linen Overshirt",
    description:
      "Relaxed silhouette in soft washed linen. Shell buttons, boxy fit. Made in Portugal in a family-run atelier that has been weaving linen for three generations.",
    price: 7900,
    compareAtPrice: 9500,
    category: "Outerwear",
    stock: 60,
    featured: true,
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: [
      {
        name: "Ecru",
        hex: "#E8E0D1",
        images: [
          img("photo-1591047139829-d91aecb6caea"),
          img("photo-1596755094514-f87e34085b2c"),
        ],
      },
      {
        name: "Olive",
        hex: "#6B7352",
        images: [img("photo-1520975916090-3105956dac38")],
      },
      {
        name: "Navy",
        hex: "#1F2A44",
        images: [img("photo-1589363358751-ab05797e5629")],
      },
    ],
    variantStock: {
      Ecru__XS: 3,
      Ecru__S: 5,
      Ecru__M: 8,
      Ecru__L: 6,
      Ecru__XL: 2,
      Olive__XS: 2,
      Olive__S: 4,
      Olive__M: 6,
      Olive__L: 5,
      Olive__XL: 3,
      Navy__XS: 1,
      Navy__S: 3,
      Navy__M: 5,
      Navy__L: 4,
      Navy__XL: 3,
    },
  },

  // 2 — Cashmere sweater, 4 colors, 4 sizes
  {
    name: "Cashmere Crewneck",
    description:
      "Pure Mongolian cashmere, 12-gauge fine knit. Ribbed cuffs and hem, clean collar. Wear it alone or layered under a coat all winter.",
    price: 12500,
    category: "Knitwear",
    stock: 48,
    featured: true,
    sizes: ["S", "M", "L", "XL"],
    colors: [
      {
        name: "Fog",
        hex: "#BFBDB2",
        images: [img("photo-1620799140408-edc6dcb6d633")],
      },
      {
        name: "Oat",
        hex: "#D6C6A8",
        images: [img("photo-1503341504253-dff4815485f1")],
      },
      {
        name: "Charcoal",
        hex: "#3A3A3A",
        images: [img("photo-1608744882201-52a7f7f3dd60")],
      },
      {
        name: "Espresso",
        hex: "#4A2E20",
        images: [img("photo-1608744882201-52a7f7f3dd60")],
      },
    ],
  },

  // 3 — Trousers, single color, multiple sizes
  {
    name: "Pleated Wide-Leg Trouser",
    description:
      "High-rise with double forward pleats and a clean drape. Japanese wool blend with a touch of stretch. Fully lined to the knee.",
    price: 9800,
    category: "Trousers",
    stock: 30,
    featured: true,
    sizes: ["26", "28", "30", "32", "34", "36"],
    colors: [
      {
        name: "Bone",
        hex: "#DED4C0",
        images: [img("photo-1594633312681-425c7b97ccd1")],
      },
    ],
  },

  // 4 — Silk dress with 2 colors, 4 sizes
  {
    name: "Silk Slip Dress",
    description:
      "Bias-cut with a thin adjustable strap. 100% mulberry silk with a soft hand feel and a weighted drape that moves beautifully.",
    price: 14200,
    category: "Dresses",
    stock: 24,
    sizes: ["XS", "S", "M", "L"],
    colors: [
      {
        name: "Ink",
        hex: "#1A1A2B",
        images: [img("photo-1583496661160-fb5886a13d74")],
      },
      {
        name: "Champagne",
        hex: "#E0C9A6",
        images: [img("photo-1515886657613-9f3515b0c78f")],
      },
    ],
  },

  // 5 — Leather tote, one color, no sizes
  {
    name: "Leather Tote — Cognac",
    description:
      'Vegetable-tanned Italian leather. Unlined body, edges painted by hand. Holds a 14" laptop, a pair of trainers, and a lunch. Ages into a deep patina.',
    price: 18900,
    category: "Accessories",
    stock: 18,
    featured: true,
    colors: [
      {
        name: "Cognac",
        hex: "#A0673F",
        images: [
          img("photo-1584917865442-de89df76afd3"),
          img("photo-1590874103328-eac38a683ce7"),
        ],
      },
    ],
  },

  // 6 — Sneakers, single color, many numeric sizes
  {
    name: "Minimal Sneaker",
    description:
      "Full-grain leather upper on a natural rubber sole. Unisex last. Stitched — not glued — so they can be resoled. True to size.",
    price: 8500,
    category: "Footwear",
    stock: 40,
    sizes: ["38", "39", "40", "41", "42", "43", "44", "45"],
    colors: [
      {
        name: "Bone",
        hex: "#E8DFCA",
        images: [img("photo-1542291026-7eec264c27ff")],
      },
      {
        name: "Black",
        hex: "#0F0F0F",
        images: [img("photo-1552346154-21d32810aba3")],
      },
    ],
    variantStock: {
      Bone__38: 1,
      Bone__39: 3,
      Bone__40: 5,
      Bone__41: 6,
      Bone__42: 6,
      Bone__43: 4,
      Bone__44: 2,
      Bone__45: 1,
      Black__38: 1,
      Black__39: 2,
      Black__40: 4,
      Black__41: 5,
      Black__42: 0,
      Black__43: 0,
      Black__44: 0,
      Black__45: 0,
    },
  },

  // 7 — Heavy overcoat
  {
    name: "Wool Overcoat",
    description:
      "Double-breasted with peak lapels. Heavyweight Italian wool, half-lined in bemberg, hand-finished collar. A coat that sits as well on a suit as over a sweatshirt.",
    price: 26500,
    category: "Outerwear",
    stock: 14,
    featured: true,
    sizes: ["S", "M", "L", "XL"],
    colors: [
      {
        name: "Charcoal",
        hex: "#36363B",
        images: [img("photo-1539533113208-f6df8cc8b543")],
      },
      {
        name: "Camel",
        hex: "#B08762",
        images: [img("photo-1544022613-e87ca75a784a")],
      },
    ],
  },

  // 8 — Ribbed tank (basic item, simple variants)
  {
    name: "Ribbed Tank",
    description:
      "Fine-gauge merino rib in a fitted tank. A quiet layer under a jacket or on its own in summer.",
    price: 3800,
    category: "Knitwear",
    stock: 80,
    sizes: ["XS", "S", "M", "L"],
    colors: [
      {
        name: "Cream",
        hex: "#F3EDDF",
        images: [img("photo-1503341504253-dff4815485f1")],
      },
      {
        name: "Black",
        hex: "#0F0F0F",
        images: [img("photo-1618354691373-d851c5c3a990")],
      },
      {
        name: "Slate",
        hex: "#5A6470",
        images: [img("photo-1503341504253-dff4815485f1")],
      },
    ],
  },

  // 9 — Silk scarf, single colour, no sizes
  {
    name: "Silk Square Scarf",
    description:
      "Hand-rolled edges, screen-printed in Como on a heavyweight silk twill. 90×90 cm, roomy enough to wear as a shawl.",
    price: 6200,
    category: "Accessories",
    stock: 22,
    colors: [
      {
        name: "Ochre",
        hex: "#B78A3C",
        images: [img("photo-1601924994987-69e26d50dc26")],
      },
    ],
  },

  // 10 — Classic denim jeans
  {
    name: "Selvedge Denim Jean",
    description:
      "Straight leg cut from 13 oz Japanese selvedge denim. Unwashed — expect some shrinkage, then a lifetime of fades that follow the shape of you.",
    price: 11800,
    category: "Trousers",
    stock: 36,
    featured: true,
    sizes: ["28", "30", "32", "34", "36"],
    colors: [
      {
        name: "Indigo",
        hex: "#23395D",
        images: [img("photo-1541099649105-f69ad21f3246")],
      },
    ],
  },

  // 11 — Oxford shirt, clean basic
  {
    name: "Oxford Shirt",
    description:
      "Soft-washed cotton oxford in a relaxed cut. Button-down collar, single chest pocket, unfussy and everyday.",
    price: 5400,
    category: "Shirts",
    stock: 50,
    sizes: ["S", "M", "L", "XL"],
    colors: [
      {
        name: "White",
        hex: "#FAFAF7",
        images: [img("photo-1598032895397-b9472444bf93")],
      },
      {
        name: "Sky",
        hex: "#BFD5E8",
        images: [img("photo-1604176354204-9268737828e4")],
      },
      {
        name: "Candy",
        hex: "#F1C7CC",
        images: [img("photo-1589310243389-96a5483213a8")],
      },
      {
        name: "Navy",
        hex: "#1F2A44",
        images: [img("photo-1588072432836-e10032774350")],
      },
    ],
  },

  // 12 — Bucket hat as a fun accessory
  {
    name: "Canvas Bucket Hat",
    description:
      "Washed cotton canvas with a reinforced brim. Packs flat. Meant to get a bit of wear on it.",
    price: 2400,
    category: "Accessories",
    stock: 40,
    sizes: ["S/M", "L/XL"],
    colors: [
      {
        name: "Sand",
        hex: "#D9C8A9",
        images: [img("photo-1575428652377-a2d80e2277fc")],
      },
      {
        name: "Forest",
        hex: "#3E5A3D",
        images: [img("photo-1576871337622-98d48d1cf531")],
      },
    ],
  },
];

// ------------------------------------------------------------------
//  Run
// ------------------------------------------------------------------
const run = async () => {
  await connectDB();
  await Promise.all([User.deleteMany({}), Product.deleteMany({})]);

  await User.create({
    name: "Covetory Admin",
    email: "admin@covetory.com",
    password: "admin123",
    isAdmin: true,
  });

  await User.create({
    name: "Sample Customer",
    email: "user@covetory.com",
    password: "user123",
  });

  await Product.insertMany(sampleProducts);

  console.log(`Seeded ${sampleProducts.length} products.`);
  console.log("Admin login  ->  admin@covetory.com / admin123");
  console.log("User login   ->  user@covetory.com / user123");
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
