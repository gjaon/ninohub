const products = require("../data/product");

const getProducts = (req, res) => {
  res.status(200).json(products);
};

const getProductById = (req, res) => {
  const { id } = req.params;
  const product = products.find((item) => String(item.id) === String(id));

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  res.status(200).json(product);
};

module.exports = {
  getProducts,
  getProductById,
};
