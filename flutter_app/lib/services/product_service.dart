import '../models/product.dart';
import 'api_client.dart';

class ProductService {
  final ApiClient _client;
  ProductService(this._client);

  Future<List<Product>> listProducts({int page = 1, int pageSize = 200}) async {
    final res = await _client.get('/tenants/inventory/products?page=$page&page_size=$pageSize');
    final items = (res['data'] as Map<String, dynamic>)['items'] as List<dynamic>? ?? [];
    return items.map((p) => Product.fromJson(p as Map<String, dynamic>)).toList();
  }
}
