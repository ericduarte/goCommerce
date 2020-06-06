import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    if (!products) {
      throw new AppError('Order must have almost one product');
    }

    if (!customer_id) {
      throw new AppError('Order must have a customer');
    }

    /* Recuperando dados dos produtos */
    const productsData = await this.productsRepository.findAllById(
      products.map(p => ({ id: p.id })),
    );

    /* Buscando cliente */
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found');
    }

    // Retornando lista com preço dos produtos
    const productsUpdated = products.map(product => {
      const productData = productsData.find(p => p.id === product.id);

      if (!productData) {
        throw new AppError(`Product with id ${product.id} not found`);
      }

      // Analisando se há estoque para o produto
      if (product.quantity > productData.quantity) {
        throw new AppError(`Product ${product.id} out of stock`);
      }

      return {
        product_id: product.id,
        price: productData.price,
        quantity: product.quantity,
      };
    });

    // Salvando pedido no repositório
    const order = await this.ordersRepository.create({
      customer,
      products: productsUpdated,
    });

    // Atualizando dados no estoque
    const stockUpdateProducts = order.order_products.map(order_product => {
      const productData = productsData.find(
        prod => prod.id === order_product.product_id,
      );

      let quantity = 0;

      if (productData) {
        quantity = productData.quantity - order_product.quantity;
      }

      return {
        id: order_product.product_id,
        quantity,
      };
    });

    // Salvando estoque atualizado no repositório
    await this.productsRepository.updateQuantity(stockUpdateProducts);

    return order;
  }
}

export default CreateOrderService;
