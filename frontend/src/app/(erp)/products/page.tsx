"use client";

import { useState } from "react";
import { Package, Plus, Search, Edit, Trash2, X } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/config";

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  category: string;
  isActive: boolean;
}

const mockProducts: Product[] = [
  { id: "1", name: "Phone Case - iPhone", sku: "PC-001", price: 5000, cost: 2500, stock: 45, minStock: 10, category: "Accessories", isActive: true },
  { id: "2", name: "USB-C Cable 1m", sku: "UC-002", price: 3000, cost: 1200, stock: 120, minStock: 20, category: "Cables", isActive: true },
  { id: "3", name: "Screen Protector", sku: "SP-003", price: 2000, cost: 800, stock: 200, minStock: 30, category: "Accessories", isActive: true },
  { id: "4", name: "Wireless Earbuds", sku: "WE-004", price: 15000, cost: 8000, stock: 25, minStock: 5, category: "Audio", isActive: true },
  { id: "5", name: "Phone Charger 20W", sku: "CH-005", price: 8000, cost: 4000, stock: 35, minStock: 10, category: "Chargers", isActive: true },
  { id: "6", name: "Bluetooth Speaker", sku: "BS-006", price: 25000, cost: 15000, stock: 12, minStock: 5, category: "Audio", isActive: false },
];

const categories = ["Accessories", "Cables", "Audio", "Chargers"];

const emptyProduct: Omit<Product, "id"> = {
  name: "",
  sku: "",
  price: 0,
  cost: 0,
  stock: 0,
  minStock: 0,
  category: "",
  isActive: true,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditing(null);
    setForm(emptyProduct);
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name,
      sku: product.sku,
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      minStock: product.minStock,
      category: product.category,
      isActive: product.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.sku || !form.category) return;
    if (editing) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editing.id ? { ...p, ...form } : p
        )
      );
    } else {
      const newProduct: Product = {
        ...form,
        id: Date.now().toString(),
      };
      setProducts((prev) => [...prev, newProduct]);
    }
    setModalOpen(false);
  };

  const handleDelete = (product: Product) => {
    setDeleteTarget(product);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  const formatCurrency = (value: number) =>
    `${CURRENCY_SYMBOL} ${value.toLocaleString()}`;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-accent" style={{ color: "#6f1a07" }} />
          <h1 className="text-2xl font-bold" style={{ color: "#2b2118" }}>
            Products
          </h1>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-colors"
          style={{ backgroundColor: "#6f1a07" }}
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      <div
        className="bg-card rounded-xl p-4"
        style={{ border: "1px solid #e8e4de" }}
      >
        <div className="relative max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: "#b3b6b7" }}
          />
          <input
            type="text"
            placeholder="Search products by name, SKU, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg text-sm outline-none"
            style={{
              border: "1px solid #e8e4de",
              color: "#2b2118",
            }}
          />
        </div>
      </div>

      <div
        className="bg-card rounded-xl overflow-hidden"
        style={{ border: "1px solid #e8e4de" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f8f8f6" }}>
                <th
                  className="text-left px-4 py-3 font-medium"
                  style={{ color: "#b3b6b7" }}
                >
                  Name
                </th>
                <th
                  className="text-left px-4 py-3 font-medium"
                  style={{ color: "#b3b6b7" }}
                >
                  SKU
                </th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  style={{ color: "#b3b6b7" }}
                >
                  Price
                </th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  style={{ color: "#b3b6b7" }}
                >
                  Cost
                </th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  style={{ color: "#b3b6b7" }}
                >
                  Stock
                </th>
                <th
                  className="text-left px-4 py-3 font-medium"
                  style={{ color: "#b3b6b7" }}
                >
                  Category
                </th>
                <th
                  className="text-center px-4 py-3 font-medium"
                  style={{ color: "#b3b6b7" }}
                >
                  Status
                </th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  style={{ color: "#b3b6b7" }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr
                  key={product.id}
                  className="transition-colors"
                  style={{ borderTop: "1px solid #e8e4de" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#f8f8f6")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <td
                    className="px-4 py-3 font-medium"
                    style={{ color: "#2b2118" }}
                  >
                    {product.name}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#af9164" }}>
                    {product.sku}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{ color: "#2b2118" }}
                  >
                    {formatCurrency(product.price)}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{ color: "#b3b6b7" }}
                  >
                    {formatCurrency(product.cost)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      style={{
                        color:
                          product.stock <= product.minStock
                            ? "#dc2626"
                            : "#2b2118",
                      }}
                    >
                      {product.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "#2b2118" }}>
                    {product.category}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: product.isActive
                          ? "#dcfce7"
                          : "#fee2e2",
                        color: product.isActive ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {product.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(product)}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: "#af9164" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#f8f8f6")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = "transparent")
                        }
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: "#dc2626" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#f8f8f6")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = "transparent")
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center"
                    style={{ color: "#b3b6b7" }}
                  >
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-card rounded-xl w-full max-w-lg mx-4 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2
                className="text-lg font-semibold"
                style={{ color: "#2b2118" }}
              >
                {editing ? "Edit Product" : "Add Product"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-md transition-colors"
                style={{ color: "#b3b6b7" }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: "#2b2118" }}
                >
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: "1px solid #e8e4de", color: "#2b2118" }}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: "#2b2118" }}
                >
                  SKU
                </label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, sku: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: "1px solid #e8e4de", color: "#2b2118" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    style={{ color: "#2b2118" }}
                  >
                    Price ({CURRENCY_SYMBOL})
                  </label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        price: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: "1px solid #e8e4de", color: "#2b2118" }}
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    style={{ color: "#2b2118" }}
                  >
                    Cost ({CURRENCY_SYMBOL})
                  </label>
                  <input
                    type="number"
                    value={form.cost}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        cost: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: "1px solid #e8e4de", color: "#2b2118" }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    style={{ color: "#2b2118" }}
                  >
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-card"
                    style={{ border: "1px solid #e8e4de", color: "#2b2118" }}
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    style={{ color: "#2b2118" }}
                  >
                    Min Stock
                  </label>
                  <input
                    type="number"
                    value={form.minStock}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        minStock: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: "1px solid #e8e4de", color: "#2b2118" }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      isActive: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                <label
                  htmlFor="isActive"
                  className="text-sm"
                  style={{ color: "#2b2118" }}
                >
                  Active
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ border: "1px solid #e8e4de", color: "#2b2118" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#6f1a07" }}
              >
                {editing ? "Update" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-card rounded-xl w-full max-w-sm mx-4 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-lg font-semibold mb-2"
              style={{ color: "#2b2118" }}
            >
              Delete Product
            </h2>
            <p className="text-sm mb-6" style={{ color: "#b3b6b7" }}>
              Are you sure you want to delete &quot;{deleteTarget.name}&quot;? This
              action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ border: "1px solid #e8e4de", color: "#2b2118" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#dc2626" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
