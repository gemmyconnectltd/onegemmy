import { Plus, Search, Filter, Package, AlertTriangle, TrendingUp, ArrowDownRight } from "lucide-react";

const stats = [
  { label: "Total Products", value: "1,284", icon: Package, color: "text-primary" },
  { label: "Low Stock Items", value: "23", icon: AlertTriangle, color: "text-accent" },
  { label: "In Transit", value: "156", icon: TrendingUp, color: "text-secondary" },
  { label: "Stock Value", value: "$284K", icon: Package, color: "text-emerald-600" },
];

const products = [
  { id: "SKU-001", name: "Widget Pro", category: "Electronics", stock: 245, minStock: 50, price: "$89.00", status: "In Stock" },
  { id: "SKU-002", name: "Gadget Standard", category: "Electronics", stock: 12, minStock: 30, price: "$45.00", status: "Low Stock" },
  { id: "SKU-003", name: "Component A", category: "Parts", stock: 890, minStock: 100, price: "$12.50", status: "In Stock" },
  { id: "SKU-004", name: "Assembly Kit", category: "Kits", stock: 0, minStock: 20, price: "$156.00", status: "Out of Stock" },
  { id: "SKU-005", name: "Premium Bundle", category: "Bundles", stock: 67, minStock: 25, price: "$299.00", status: "In Stock" },
];

export default function StockPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stock & Inventory</h1>
          <p className="text-sm text-muted mt-1">Manage your products and inventory levels</p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors">
          <Plus size={16} />
          Add Product
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center">
                <stat.icon size={20} className={stat.color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search products by name or SKU..."
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-surface transition-colors">
            <Filter size={14} />
            Filter
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="p-4 font-medium">SKU</th>
              <th className="p-4 font-medium">Product Name</th>
              <th className="p-4 font-medium">Category</th>
              <th className="p-4 font-medium">Stock</th>
              <th className="p-4 font-medium">Price</th>
              <th className="p-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-surface/50 transition-colors">
                <td className="p-4 text-xs font-mono text-muted">{product.id}</td>
                <td className="p-4 text-sm font-medium text-foreground">{product.name}</td>
                <td className="p-4 text-sm text-foreground/70">{product.category}</td>
                <td className="p-4">
                  <span className={`text-sm font-semibold ${product.stock <= product.minStock ? "text-accent" : "text-foreground"}`}>
                    {product.stock}
                  </span>
                </td>
                <td className="p-4 text-sm text-foreground">{product.price}</td>
                <td className="p-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    product.status === "In Stock" ? "bg-emerald-50 text-emerald-600" :
                    product.status === "Low Stock" ? "bg-amber-50 text-amber-600" :
                    "bg-red-50 text-red-600"
                  }`}>
                    {product.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
